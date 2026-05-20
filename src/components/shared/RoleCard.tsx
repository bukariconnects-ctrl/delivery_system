"use client";

import Link from "next/link";
import { UserCircle, Store, Truck, Shield, type LucideIcon } from "lucide-react";
import type { DistributedNode, UserRole } from "@/types";

const iconMap: Record<UserRole, LucideIcon> = {
  client: UserCircle,
  restaurant: Store,
  driver: Truck,
  admin: Shield,
};

interface RoleCardProps {
  node: DistributedNode;
}

export function RoleCard({ node }: RoleCardProps) {
  const Icon = iconMap[node.role];

  return (
    <Link
      href={node.route}
      className="group flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-400"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400">
        <Icon size={32} />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {node.label}
      </h3>
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        {node.description}
      </p>
    </Link>
  );
}
