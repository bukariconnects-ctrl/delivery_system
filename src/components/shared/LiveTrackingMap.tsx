"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pickupIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const deliveryIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const driverIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({
  pickupLat, pickupLng, deliveryLat, deliveryLng, driverLat, driverLng,
}: {
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number;
  driverLng?: number;
}) {
  const map = useMap();
  useEffect(() => {
    const points: L.LatLngExpression[] = [
      [pickupLat, pickupLng],
      [deliveryLat, deliveryLng],
    ];
    if (driverLat != null && driverLng != null) {
      points.push([driverLat, driverLng]);
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, pickupLat, pickupLng, deliveryLat, deliveryLng, driverLat, driverLng]);
  return null;
}

interface LiveTrackingMapProps {
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  driverLat?: number;
  driverLng?: number;
  height?: string;
}

export default function LiveTrackingMap({
  pickupLat,
  pickupLng,
  deliveryLat,
  deliveryLng,
  driverLat,
  driverLng,
  height = "250px",
}: LiveTrackingMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"
      >
        <p className="text-sm text-gray-400">جاري تحميل الخريطة...</p>
      </div>
    );
  }

  const centerLat = (pickupLat + deliveryLat) / 2;
  const centerLng = (pickupLng + deliveryLng) / 2;

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
        style={{ height }}
      >
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[pickupLat, pickupLng]} icon={pickupIcon} />
          <Marker position={[deliveryLat, deliveryLng]} icon={deliveryIcon} />
          {driverLat != null && driverLng != null && (
            <Marker position={[driverLat, driverLng]} icon={driverIcon} />
          )}
          <FitBounds
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            deliveryLat={deliveryLat}
            deliveryLng={deliveryLng}
            driverLat={driverLat}
            driverLng={driverLng}
          />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" /> الاستلام
        </span>
        {driverLat != null && (
          <span className="flex items-center gap-1 text-blue-600">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> السائق
          </span>
        )}
        <span className="flex items-center gap-1 text-red-600">
          <span className="h-2 w-2 rounded-full bg-red-500" /> التوصيل
        </span>
      </div>
    </div>
  );
}
