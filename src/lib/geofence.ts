/**
 * Geofenced Submission Zones — prevents readings from being submitted outside
 * designated project areas, avoiding costly misattribution in carbon projects
 * or regulatory breaches in environmental monitoring.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoFenceZone {
  id: string;
  name: string;
  polygon: GeoPoint[];
  center?: GeoPoint;
  radius?: number;
  type: 'polygon' | 'circle';
}

/**
 * Validates GPS coordinates and throws on invalid input.
 */
function validateCoordinates(point: GeoPoint): void {
  if (typeof point.lat !== 'number' || typeof point.lng !== 'number') {
    throw new Error('Invalid GPS coordinates: lat and lng must be numbers');
  }
  if (Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
    throw new Error('Invalid GPS coordinates: NaN values not allowed');
  }
  if (point.lat < -90 || point.lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }
  if (point.lng < -180 || point.lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }
}

/**
 * Checks if a point is inside a polygon using ray casting algorithm.
 */
function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect =
      yi > point.lng !== yj > point.lng &&
      point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Calculates distance between two points using Haversine formula.
 * Returns distance in meters.
 */
function haversineDistance(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371000;
  const lat1Rad = (p1.lat * Math.PI) / 180;
  const lat2Rad = (p2.lat * Math.PI) / 180;
  const deltaLatRad = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLngRad = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLngRad / 2) *
      Math.sin(deltaLngRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Checks if a point is inside a circular zone.
 */
function pointInCircle(
  point: GeoPoint,
  center: GeoPoint,
  radiusMeters: number
): boolean {
  return haversineDistance(point, center) <= radiusMeters;
}

/**
 * Checks if a GPS coordinate is inside any of the configured geofence zones.
 *
 * @param point - The GPS coordinates to check { lat, lng }
 * @param zones - Array of geofence zones to check against
 * @returns boolean - true if the point is inside at least one zone, false otherwise
 * @throws Error - if coordinates are invalid (lat not in [-90,90] or lng not in [-180,180])
 */
export function isInsideGeofence(point: GeoPoint, zones: GeoFenceZone[]): boolean {
  validateCoordinates(point);

  if (!zones || zones.length === 0) {
    return true;
  }

  for (const zone of zones) {
    if (zone.type === 'polygon' && zone.polygon && zone.polygon.length >= 3) {
      if (pointInPolygon(point, zone.polygon)) {
        return true;
      }
    } else if (
      zone.type === 'circle' &&
      zone.center &&
      typeof zone.radius === 'number' &&
      zone.radius > 0
    ) {
      if (pointInCircle(point, zone.center, zone.radius)) {
        return true;
      }
    }
  }

  return false;
}
