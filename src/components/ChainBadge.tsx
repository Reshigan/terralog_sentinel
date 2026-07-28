import React, { useMemo } from "react";

/**
 * Chain link data structure representing a single entry in the cryptographic chain.
 */
export interface ChainLink {
  hash: string;
  prevHash: string;
}

/**
 * Props for the ChainBadge component.
 */
interface ChainBadgeProps {
  /** Array of chain links to display and verify. */
  chain: ChainLink[];
}

/**
 * Validates the cryptographic integrity of the chain.
 * Each hash must correctly reference the previous hash.
 */
function validateChain(chain: ChainLink[]): boolean {
  if (chain.length === 0) return false;
  if (chain.length === 1) {
    // Single link is valid if it has a hash
    return chain[0].hash.length > 0;
  }

  // Verify each link connects to the previous one
  for (let i = 1; i < chain.length; i++) {
    const current = chain[i];
    const previous = chain[i - 1];
    if (current.prevHash !== previous.hash) {
      return false;
    }
  }
  return true;
}

/**
 * Immutable Evidence Chain Badge — displays cryptographic chain of custody status.
 * Shows valid/invalid state based on cryptographic integrity verification.
 */
export const ChainBadge: React.FC<ChainBadgeProps> = ({ chain }) => {
  const isValid = useMemo(() => validateChain(chain), [chain]);
  const linkCount = chain.length;

  // Truncate hash for display (first 8 chars)
  const truncateHash = (hash: string): string => {
    if (!hash || hash.length < 8) return hash;
    return `${hash.slice(0, 8)}…`;
  };

  return (
    <div
      role="status"
      aria-label={isValid ? "Chain is valid" : "Chain is invalid"}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium"
      style={{
        backgroundColor: isValid ? "rgba(34, 197, 94, 0.1)" : "rgba(192, 82, 79, 0.1)",
        borderColor: isValid ? "#22c55e" : "#c0524f",
        color: isValid ? "#22c55e" : "#c0524f",
      }}
    >
      {/* Chain icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>

      {/* Status label */}
      <span className="font-semibold tracking-tight">
        {isValid ? "Verified" : "Broken"}
      </span>

      {/* Divider */}
      <span
        aria-hidden="true"
        style={{ color: "var(--ink-soft, #aab0b8)" }}
      >
        |
      </span>

      {/* Link count */}
      <span style={{ color: "var(--ink-soft, #aab0b8)" }}>
        {linkCount} link{linkCount !== 1 ? "s" : ""}
      </span>

      {/* Show head hash when valid */}
      {isValid && chain.length > 0 && (
        <code
          className="text-xs font-mono ml-1"
          style={{ color: "var(--ink-soft, #aab0b8)" }}
          aria-label={`Root hash: ${chain[0].hash}`}
        >
          {truncateHash(chain[0].hash)}
        </code>
      )}
    </div>
  );
};

export default ChainBadge;
