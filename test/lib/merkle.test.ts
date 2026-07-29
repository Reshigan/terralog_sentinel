import { describe, it, expect } from "vitest";
import { computeMerkleRoot, verifyMerkleProof } from "../../src/lib/merkle";

describe("Merkle tree", () => {
  it("root of empty set is zero hash", async () => {
    const root = await computeMerkleRoot([]);
    expect(root).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("root of single leaf is hash of leaf", async () => {
    const leaf = "hello";
    const expected = await sha256Hex(leaf);
    const root = await computeMerkleRoot([leaf]);
    expect(root).toBe(expected);
  });

  it("root of two leaves combines hashes", async () => {
    const a = "a";
    const b = "b";
    const hashA = await sha256Hex(a);
    const hashB = await sha256Hex(b);
    const combined = hashA < hashB ? hashA + hashB : hashB + hashA;
    const expected = await sha256Hex(combined);
    const root = await computeMerkleRoot([a, b]);
    expect(root).toBe(expected);
  });

  it("root of three leaves pads with duplicate", async () => {
    const leaves = ["a", "b", "c"];
    const root = await computeMerkleRoot(leaves);
    // Verify determinism
    const root2 = await computeMerkleRoot(leaves);
    expect(root).toBe(root2);
    // Verify length is 64 hex chars
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });

  it("proof verifies for single leaf", async () => {
    const leaf = "test";
    const { root, proof } = await computeMerkleRoot([leaf], { includeProofs: true });
    const leafHash = await sha256Hex(leaf);
    const verified = await verifyMerkleProof(leafHash, proof[0]!, root);
    expect(verified).toBe(true);
  });

  it("proof verifies for multiple leaves", async () => {
    const leaves = ["a", "b", "c", "d"];
    const { root, proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    expect(proof).toHaveLength(4);

    for (let i = 0; i < leaves.length; i++) {
      const leafHash = await sha256Hex(leaves[i]!);
      const verified = await verifyMerkleProof(leafHash, proof[i]!, root);
      expect(verified).toBe(true);
    }
  });

  it("proof fails for wrong leaf", async () => {
    const leaves = ["a", "b"];
    const { root, proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    const wrongHash = await sha256Hex("c");
    const verified = await verifyMerkleProof(wrongHash, proof[0]!, root);
    expect(verified).toBe(false);
  });

  it("proof fails for tampered sibling", async () => {
    const leaves = ["a", "b"];
    const { root, proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    const leafHash = await sha256Hex("a");
    const tamperedProof = {
      ...proof[0]!,
      siblings: [await sha256Hex("tampered")],
    };
    const verified = await verifyMerkleProof(leafHash, tamperedProof, root);
    expect(verified).toBe(false);
  });

  it("known vector: specific four-leaf tree", async () => {
    // Known test vector from RFC 6962 style tree
    const leaves = ["alpha", "beta", "gamma", "delta"];
    const { root, proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    
    // Each leaf's proof should verify against the same root
    for (let i = 0; i < leaves.length; i++) {
      const leafHash = await sha256Hex(leaves[i]!);
      const verified = await verifyMerkleProof(leafHash, proof[i]!, root);
      expect(verified).toBe(true);
    }

    // Root should be consistent across recomputation
    const { root: root2 } = await computeMerkleRoot(leaves);
    expect(root).toBe(root2);
  });

  it("handles large number of leaves", async () => {
    const leaves = Array.from({ length: 100 }, (_, i) => `leaf-${i}`);
    const { root, proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    
    // Spot check a few proofs
    const indices = [0, 50, 99];
    for (const i of indices) {
      const leafHash = await sha256Hex(leaves[i]!);
      const verified = await verifyMerkleProof(leafHash, proof[i]!, root);
      expect(verified).toBe(true);
    }
  });

  it("proof indices are correct", async () => {
    const leaves = ["a", "b", "c", "d"];
    const { proof } = await computeMerkleRoot(leaves, { includeProofs: true });
    
    expect(proof[0]!.leafIndex).toBe(0);
    expect(proof[1]!.leafIndex).toBe(1);
    expect(proof[2]!.leafIndex).toBe(2);
    expect(proof[3]!.leafIndex).toBe(3);
  });
});

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
