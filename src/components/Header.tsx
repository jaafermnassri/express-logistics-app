import React from 'react';
import { Truck } from 'lucide-react';

interface HeaderProps {
  activeDeliveriesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ activeDeliveriesCount = 0 }) => {
  return (
    <header className="sticky top-0 z-30 bg-[#673ab7] text-white shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-white text-[#673ab7] flex items-center justify-center font-black">
            <Truck className="w-5 h-5 text-[#673ab7]" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-white leading-tight">EXPRESS LOGISTICS</h1>
            <p className="text-xs text-white/80">Portail Chauffeur & Gestion des Livraisons</p>
          </div>
        </div>

        {activeDeliveriesCount > 0 && (
          <div className="bg-white/15 px-3 py-1 rounded-full text-xs font-semibold text-white border border-white/20">
            {activeDeliveriesCount} colis en transit
          </div>
        )}
      </div>
    </header>
  );
};

