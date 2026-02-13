"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { RegionStat } from "@/types/domain";

const DAEGU_CENTER: [number, number] = [35.8714, 128.6014];

const REGION_COORDS: Record<string, [number, number]> = {
  대구광역시: [35.8714, 128.6014],
  중구: [35.8695, 128.6062],
  동구: [35.8868, 128.6354],
  서구: [35.8715, 128.5593],
  남구: [35.8467, 128.5977],
  북구: [35.8857, 128.5827],
  수성구: [35.8583, 128.6307],
  달서구: [35.8299, 128.5327],
  달성군: [35.7748, 128.4314],
  경산시: [35.8251, 128.7418],
  칠곡군: [35.9956, 128.4017],
  구미시: [36.1195, 128.3446],
  영천시: [35.9732, 128.9386],
  경주시: [35.8562, 129.2248],
  포항시: [36.019, 129.3435]
};

interface RegionSalesMapProps {
  overallStats: RegionStat[];
  agencyStats: RegionStat[];
}

interface RegionPoint {
  region: string;
  sales: number;
  share: number;
  lat: number;
  lng: number;
  radius: number;
}

function normalizedRegionToken(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

function hashToOffset(seed: string): [number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const latOffset = ((hash & 0xff) / 255) * 0.06 - 0.03;
  const lngOffset = (((hash >> 8) & 0xff) / 255) * 0.08 - 0.04;
  return [latOffset, lngOffset];
}

function resolveCoordinate(region: string): [number, number] {
  const tokens = region
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (REGION_COORDS[token]) {
      return REGION_COORDS[token];
    }
  }

  const normalizedRegion = normalizedRegionToken(region);
  for (const [key, coord] of Object.entries(REGION_COORDS)) {
    if (normalizedRegion.includes(normalizedRegionToken(key))) {
      return coord;
    }
  }

  return DAEGU_CENTER;
}

function buildPoints(stats: RegionStat[], maxSales: number): RegionPoint[] {
  if (stats.length === 0) {
    return [];
  }

  const safeMax = Math.max(maxSales, 1);

  return stats.map((stat) => {
    const [baseLat, baseLng] = resolveCoordinate(stat.region);
    const [latOffset, lngOffset] = hashToOffset(stat.region);
    const ratio = stat.sales / safeMax;

    return {
      ...stat,
      lat: baseLat + latOffset,
      lng: baseLng + lngOffset,
      radius: 4 + Math.sqrt(ratio) * 14
    };
  });
}

export function RegionSalesMap({ overallStats, agencyStats }: RegionSalesMapProps) {
  const maxSales = Math.max(
    ...overallStats.map((stat) => stat.sales),
    ...agencyStats.map((stat) => stat.sales),
    1
  );

  const overallPoints = buildPoints(overallStats, maxSales);
  const agencyPoints = buildPoints(agencyStats, maxSales);

  if (overallPoints.length === 0 && agencyPoints.length === 0) {
    return (
      <div className="flex h-[440px] items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
        지역 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[460px] overflow-hidden rounded-lg border">
        <MapContainer center={DAEGU_CENTER} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {overallPoints.map((point) => (
            <CircleMarker
              key={`overall-${point.region}`}
              center={[point.lat, point.lng]}
              radius={point.radius}
              pathOptions={{
                color: "rgb(107, 114, 128)",
                fillColor: "rgb(107, 114, 128)",
                fillOpacity: 0.4,
                weight: 1
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{point.region}</p>
                  <p>B2B 전체: {point.sales.toLocaleString("ko-KR")}원</p>
                  <p>비중: {point.share.toFixed(2)}%</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}

          {agencyPoints.map((point) => (
            <CircleMarker
              key={`agency-${point.region}`}
              center={[point.lat, point.lng]}
              radius={point.radius}
              pathOptions={{
                color: "rgb(220, 38, 38)",
                fillColor: "rgb(220, 38, 38)",
                fillOpacity: 0.4,
                weight: 1
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={0.98}>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{point.region}</p>
                  <p>선택 대리점: {point.sales.toLocaleString("ko-KR")}원</p>
                  <p>비중: {point.share.toFixed(2)}%</p>
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-md border bg-white px-3 py-3 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-gray-500/70" />
          <span>DESKER B2B 전체 지역 분포 (회색 40%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-red-600/80" />
          <span>선택 대리점 지역 분포 (빨간색 40%)</span>
        </div>
      </div>
    </div>
  );
}
