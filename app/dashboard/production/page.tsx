/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import React, { useState, useTransition } from "react";
import { 
  QrCode, 
  Search, 
  Printer, 
  Package, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw, 
  Download, 
  Mail, 
  Truck,
  Layers,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet
} from "lucide-react";

// Mock types matching database schema
interface OrderItem {
  id: string;
  product_name: string;
  sku: string;
  quantity: number;
  price: number;
  artwork_file_url: string;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total_price: number;
  shipping_price: number;
  raw_materials_cost: number;
  net_profit: number;
  status: "PENDING_ARTWORK" | "READY_FOR_PRODUCTION" | "PRINTED_AND_PACKED" | "FULFILLED" | "CANCELLED";
  created_at: string;
  order_items: OrderItem[];
  tracking_number?: string;
}

// Initial mock state for Next.js preview render
const INITIAL_ORDERS: Order[] = [
  {
    id: "ord-8291",
    order_number: "#1024",
    customer_name: "Andrius Kazlauskas",
    customer_email: "andrius@gmail.com",
    total_price: 189.50,
    shipping_price: 6.90,
    raw_materials_cost: 32.40,
    net_profit: 150.20,
    status: "READY_FOR_PRODUCTION",
    created_at: "2026-06-24T10:30:00Z",
    order_items: [
      {
        id: "item-1",
        product_name: "Foto drobė Premium 60x90cm",
        sku: "CANVAS-6090-PREM",
        quantity: 1,
        price: 189.50,
        artwork_file_url: "https://supabase-storage.printflow.lt/documents/artwork_1024.pdf"
      }
    ]
  },
  {
    id: "ord-8292",
    order_number: "#1025",
    customer_name: "Rasa Petraitytė",
    customer_email: "rasa@petraityte.lt",
    total_price: 45.00,
    shipping_price: 4.50,
    raw_materials_cost: 8.50,
    net_profit: 32.00,
    status: "PENDING_ARTWORK",
    created_at: "2026-06-24T11:15:00Z",
    order_items: [
      {
        id: "item-2",
        product_name: "Plakatas Satin 40x60cm",
        sku: "POSTER-4060-SAT",
        quantity: 2,
        price: 22.50,
        artwork_file_url: ""
      }
    ]
  },
  {
    id: "ord-8293",
    order_number: "#1026",
    customer_name: "Tomas Sabonis",
    customer_email: "tomas@sabonis-design.com",
    total_price: 312.00,
    shipping_price: 0.00,
    raw_materials_cost: 64.20,
    net_profit: 247.80,
    status: "PRINTED_AND_PACKED",
    created_at: "2026-06-24T09:45:00Z",
    order_items: [
      {
        id: "item-3",
        product_name: "Lipdukai Roll-Feed (500 vnt.)",
        sku: "STICKER-ROLL-500",
        quantity: 1,
        price: 312.00,
        artwork_file_url: "https://supabase-storage.printflow.lt/documents/artwork_1026.pdf"
      }
    ]
  }
];

const INVENTORY_RAW_MATERIALS = [
  { name: "Premium Canvas Drobė (m²)", remaining: 124.5, unit: "m²", threshold: 20, cost: 8.50 },
  { name: "Satininis Plakatų Popierius (m²)", remaining: 14.2, unit: "m²", threshold: 15, cost: 2.10 },
  { name: "Eco-Solvent CMYK rašalai (ml)", remaining: 840, unit: "ml", threshold: 100, cost: 0.12 },
  { name: "Sustiprintos transportavimo tūtos (vnt)", remaining: 8, unit: "vnt", threshold: 10, cost: 1.50 }
];

export default function ProductionDashboard() {
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [inventory, setInventory] = useState(INVENTORY_RAW_MATERIALS);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [scannedCode, setScannedCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Simulated Server Action: QR Code Scanned
  const handleQRScanSimulation = async (orderId: string) => {
    // Changes status from READY_FOR_PRODUCTION to PRINTED_AND_PACKED
    startTransition(async () => {
      // In Next.js, this would call: await updateOrderStatusAction(orderId, 'PRINTED_AND_PACKED')
      setOrders(prev => prev.map(order => {
        if (order.id === orderId) {
          if (order.status === "READY_FOR_PRODUCTION") {
            // Deduct raw materials associated with order
            deductInventoryForOrder(order);
            return { ...order, status: "PRINTED_AND_PACKED" };
          }
          return order;
        }
        return order;
      }));

      const targetOrder = orders.find(o => o.id === orderId);
      if (targetOrder) {
        setScanMessage(`Sėkmingai nuskenuotas užsakymas ${targetOrder.order_number}! Būsena pakeista į: PRINTED_AND_PACKED.`);
        setTimeout(() => setScanMessage(""), 5000);
      }
    });
  };

  // Helper function to simulate inventory deduction upon printing
  const deductInventoryForOrder = (order: Order) => {
    setInventory(prev => prev.map(material => {
      let usedAmount = 0;
      if (material.name.includes("Canvas") && order.order_items.some(i => i.sku.includes("CANVAS"))) {
        usedAmount = 2.5;
      } else if (material.name.includes("Plakatų") && order.order_items.some(i => i.sku.includes("POSTER"))) {
        usedAmount = 1.2;
      } else if (material.name.includes("rašalai")) {
        usedAmount = 45; // ml per printed job average
      } else if (material.name.includes("tūtos")) {
        usedAmount = 1;
      }

      return {
        ...material,
        remaining: Math.max(0, material.remaining - usedAmount)
      };
    }));
  };

  // Simulated Manual Webhook creation to test order stream
  const triggerMockShopifyOrder = () => {
    const newOrderNo = `#10${27 + orders.length}`;
    const newOrder: Order = {
      id: `ord-${Math.floor(Math.random() * 9000) + 1000}`,
      order_number: newOrderNo,
      customer_name: "Simuliuotas Shopify Klientas",
      customer_email: "klientas@shopify.lt",
      total_price: 120.00,
      shipping_price: 5.90,
      raw_materials_cost: 15.00,
      net_profit: 99.10,
      status: "PENDING_ARTWORK",
      created_at: new Date().toISOString(),
      order_items: [
        {
          id: `item-${Date.now()}`,
          product_name: "Drobė Standard 40x50cm",
          sku: "CANVAS-4050-STD",
          quantity: 1,
          price: 120.00,
          artwork_file_url: "https://supabase-storage.printflow.lt/documents/artwork_new.pdf"
        }
      ]
    };

    setOrders(prev => [newOrder, ...prev]);
  };

  // Filter and Search logic
  const filteredOrders = orders.filter(order => {
    const matchesFilter = filter === "ALL" || order.status === filter;
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.order_items.some(i => i.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen text-slate-800">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Gamybos Salės Monitorius</h1>
          <p className="text-slate-500 mt-1">Printflow ERP • Užsakymų eilė, spaudos failai ir sandėlio nurašymas realiu laiku</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={triggerMockShopifyOrder}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
            Imituoti Shopify Užsakymą
          </button>
        </div>
      </div>

      {/* RAW INVENTORY WARNING ALERT */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {inventory.map((mat) => {
          const isCritical = mat.remaining < mat.threshold;
          return (
            <div 
              key={mat.name} 
              className={`p-4 rounded-xl border bg-white shadow-sm flex items-center justify-between ${
                isCritical ? "border-amber-200 bg-amber-50/50" : "border-slate-200"
              }`}
            >
              <div className="space-y-1">
                <span className="text-xs text-slate-500 block font-medium uppercase tracking-wider">{mat.name}</span>
                <span className="text-lg font-bold tracking-tight">
                  {mat.remaining.toFixed(1)} {mat.unit}
                </span>
              </div>
              <div>
                {isCritical ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Kritinis likutis
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Saugu
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* QUICK ACTIONS & QR SIMULATION PORT */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-indigo-600" />
          QR Skenavimo / Barkodų Imitatorius gamyboje
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Nuskenavus užsakymo QR kodą, būsena DB pakeičiama iš <strong>READY_FOR_PRODUCTION</strong> į <strong>PRINTED_AND_PACKED</strong>, automatiškai nurašomos žaliavos iš sandėlio ir atnaujinama Shopify apyvarta.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Įveskite arba pasirinkite užsakymo ID (pvz., ord-8291)"
            value={scannedCode}
            onChange={(e) => setScannedCode(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
          />
          <button 
            onClick={() => handleQRScanSimulation(scannedCode)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm px-5 py-2 rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            Vykdyti QR Nuskaitymą
          </button>
        </div>

        {scanMessage && (
          <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-lg text-sm flex items-center gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span className="font-medium">{scanMessage}</span>
          </div>
        )}
      </div>

      {/* MAIN QUEUE VIEW WITH FILTERS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* BAR WITH FILTERS AND SEARCH */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50/50">
          
          {/* Status filter buttons */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Visi", value: "ALL" },
              { label: "Laukia failo (PENDING)", value: "PENDING_ARTWORK" },
              { label: "Paruošta spaudai (READY)", value: "READY_FOR_PRODUCTION" },
              { label: "Atspausdinta & Supakuota", value: "PRINTED_AND_PACKED" },
              { label: "Išsiųsta (FULFILLED)", value: "FULFILLED" }
            ].map((btn) => (
              <button
                key={btn.value}
                onClick={() => setFilter(btn.value)}
                className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  filter === btn.value 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Ieškoti užsakymų..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* ORDER QUEUE TABLE */}
        <div className="overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Layers className="w-8 h-8 mx-auto text-slate-300 mb-3" />
              <p className="font-medium text-sm">Nerasta jokių užsakymų pagal pasirinktus kriterijus.</p>
              <p className="text-xs text-slate-400 mt-1">Sukurkite imituotą užsakymą spausdami mygtuką viršuje.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold text-slate-400 uppercase bg-slate-50/50">
                  <th className="p-4 w-24">Užsakymas</th>
                  <th className="p-4">Klientas</th>
                  <th className="p-4">Prekės gamybai</th>
                  <th className="p-4">Būsena</th>
                  <th className="p-4 text-right">Kaina</th>
                  <th className="p-4 text-center">QR kodas / Veiksmas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900">
                      {order.order_number}
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-900">{order.customer_name}</div>
                      <div className="text-xs text-slate-500">{order.customer_email}</div>
                    </td>
                    <td className="p-4">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="space-y-1">
                          <div className="font-medium text-slate-900">
                            {item.quantity}x {item.product_name}
                          </div>
                          <div className="font-mono text-xs text-indigo-600">
                            SKU: {item.sku}
                          </div>
                          {item.artwork_file_url ? (
                            <a 
                              href="#" 
                              onClick={(e) => { e.preventDefault(); alert(`Atsisiunčiamas spaudos failas 300 DPI CMYK: ${item.artwork_file_url}`); }}
                              className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium underline mt-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Spaudos Failas (DPI 300 CMYK)
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="w-3 h-3" />
                              Laukiama Shopify artwork failo
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        order.status === "PENDING_ARTWORK" 
                          ? "bg-amber-100 text-amber-800"
                          : order.status === "READY_FOR_PRODUCTION"
                          ? "bg-blue-100 text-blue-800"
                          : order.status === "PRINTED_AND_PACKED"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {order.status === "PENDING_ARTWORK" && "Laukiama maketo"}
                        {order.status === "READY_FOR_PRODUCTION" && "Paruošta spaudai"}
                        {order.status === "PRINTED_AND_PACKED" && "Atspausdinta / Supakuota"}
                        {order.status === "FULFILLED" && "Išsiųsta klientui"}
                      </span>
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-900">
                      {order.total_price.toFixed(2)} EUR
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        {order.status === "READY_FOR_PRODUCTION" && (
                          <button
                            onClick={() => {
                              setScannedCode(order.id);
                              handleQRScanSimulation(order.id);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            Skenuoti QR
                          </button>
                        )}
                        <button
                          onClick={() => {
                            alert(`Buhalterinė sąskaita sugeneruota užsakymui ${order.order_number}`);
                          }}
                          className="p-1.5 hover:bg-slate-100 text-slate-500 rounded transition-colors"
                          title="Sąskaita-faktūra"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
