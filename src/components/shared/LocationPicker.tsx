"use client";

import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icon issue in Next.js
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

L.Marker.prototype.options.icon = defaultIcon;

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: string;
  disabled?: boolean;
}

interface LocationDisplayProps {
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  height?: string;
}

function MapClickHandler({ onLocationChange }: { onLocationChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [map, lat, lng]);
  return null;
}

function FitBoundsMap({ pickupLat, pickupLng, deliveryLat, deliveryLng }: { pickupLat: number; pickupLng: number; deliveryLat: number; deliveryLng: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(
      [pickupLat, pickupLng],
      [deliveryLat, deliveryLng]
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, pickupLat, pickupLng, deliveryLat, deliveryLng]);
  return null;
}

export function LocationPicker({
  initialLat = 24.7136,
  initialLng = 46.6753,
  onLocationChange,
  height = "300px",
  disabled = false,
}: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number]>([initialLat, initialLng]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPosition([initialLat, initialLng]);
  }, [initialLat, initialLng]);

  const handleLocationChange = useCallback(
    (lat: number, lng: number) => {
      if (disabled) return;
      setPosition([lat, lng]);
      onLocationChange(lat, lng);
    },
    [disabled, onLocationChange]
  );

  const handleGetCurrentLocation = () => {
    if (disabled) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setPosition([latitude, longitude]);
          onLocationChange(latitude, longitude);
        },
        (err) => {
          console.error("Geolocation error:", err);
        }
      );
    }
  };

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

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" style={{ height }}>
        <MapContainer
          center={position}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={position}
            icon={defaultIcon}
            draggable={!disabled}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const pos = marker.getLatLng();
                handleLocationChange(pos.lat, pos.lng);
              },
            }}
          />
          {!disabled && <MapClickHandler onLocationChange={handleLocationChange} />}
          <RecenterMap lat={position[0]} lng={position[1]} />
        </MapContainer>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={disabled}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          📍 موقعي الحالي
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {position[0].toFixed(6)}, {position[1].toFixed(6)}
        </p>
      </div>
    </div>
  );
}

export function LocationDisplay({
  pickupLat,
  pickupLng,
  deliveryLat,
  deliveryLng,
  height = "250px",
}: LocationDisplayProps) {
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
      <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700" style={{ height }}>
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
          <FitBoundsMap
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            deliveryLat={deliveryLat}
            deliveryLng={deliveryLng}
          />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" /> الاستلام
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <span className="h-2 w-2 rounded-full bg-red-500" /> التوصيل
        </span>
      </div>
    </div>
  );
}
