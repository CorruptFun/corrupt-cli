"use client";
import { useState } from "react";
import Showroom from "@/components/home/Showroom";
import FinancingSection from "@/components/home/FinancingSection";
import type { Vehicle } from "@/lib/types";

/**
 * Client island wiring the showroom to the financing form: "Apply for
 * Financing" in the details modal pins that vehicle onto the application.
 */
export default function HomeClient({ vehicles }: { vehicles: Vehicle[] }) {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  const handleApply = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    document.getElementById("financing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <Showroom vehicles={vehicles} onApply={handleApply} />
      <FinancingSection selectedVehicle={selectedVehicle} onClearVehicle={() => setSelectedVehicle(null)} />
    </>
  );
}
