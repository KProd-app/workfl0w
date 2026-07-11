/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Layers, 
  QrCode, 
  TrendingUp, 
  Database, 
  Mail, 
  Search, 
  RefreshCw, 
  FileText, 
  Truck, 
  Printer, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Plus, 
  Download, 
  Send, 
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCcw,
  Clock
} from "lucide-react";

const WEBHOOK_TEST_SECRET = "shopify_printflow_hmac_secret_2026";

// Types matching backend state
interface OrderItem {
  id: string;
  product_name: string;
  sku: string;
  quantity: number;
  price: number;
  artwork_file_url?: string;
}

interface Order {
  id: string;
  shopify_order_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total_price: number;
  shipping_price: number;
  raw_materials_cost: number;
  net_profit: number;
  status: "PENDING_ARTWORK" | "READY_FOR_PRODUCTION" | "PRINTED_AND_PACKED" | "FULFILLED" | "CANCELLED";
  shipping_address: any;
  tracking_number?: string;
  shipping_label_url?: string;
  shopify_fulfilled: boolean;
  created_at: string;
  order_items: OrderItem[];
}

interface InventoryItem {
  id: string;
  material_name: string;
  sku: string;
  quantity_remaining: number;
  unit: string;
  critical_threshold: number;
  cost_per_unit: number;
}

interface Invoice {
  id: string;
  order_id: string;
  invoice_number: string;
  pdf_url: string;
  issued_at: string;
  sent_to_customer_at?: string;
  status: "ISSUED" | "SENT" | "FAILED";
}

interface EmailLog {
  id: string;
  timestamp: string;
  recipient: string;
  subject: string;
  status: string;
  bodyPreview: string;
}

interface MonthlySummary {
  reportMonth: string;
  totalOrders: number;
  totalRevenue: number;
  totalShippingRevenue: number;
  totalMaterialsCost: number;
  totalNetProfit: number;
  totalInvoicesIssued: number;
  profitMarginPercent: number;
}

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"production" | "webhook" | "inventory" | "finance" | "emails" | "config">("production");

  // State managers
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [financeSummary, setFinanceSummary] = useState<MonthlySummary | null>(null);

  // SaaS Multi-Station & Role states
  const [stationsList, setStationsList] = useState<any[]>([]);
  const [productConfigs, setProductConfigs] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<"ADMIN" | "WORKER" | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedStationName, setSelectedStationName] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<"ADMIN" | "WORKER">("ADMIN");
  const [tempStationId, setTempStationId] = useState<string>("");
  const [workerItems, setWorkerItems] = useState<any[]>([]);
  const [adminStationFilter, setAdminStationFilter] = useState<string>("ALL");

  // Flatbeds & Diffuser states
  const [stationBeds, setStationBeds] = useState<any[]>([]);
  const [selectedBedId, setSelectedBedId] = useState<string>("");
  const [activeWorkerTab, setActiveWorkerTab] = useState<"production" | "shipping">("production");
  const [activeWorkerItemId, setActiveWorkerItemId] = useState<string | null>(null);
  const [workerSteps, setWorkerSteps] = useState<{ [itemId: string]: number }>({});
  const [generatingPrintfile, setGeneratingPrintfile] = useState(false);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [expandedBedsList, setExpandedBedsList] = useState<any[]>([]);

  // Form states for creating stations and configs
  const [newStationName, setNewStationName] = useState("");
  const [newStationCode, setNewStationCode] = useState("");
  const [newStationDesc, setNewStationDesc] = useState("");
  const [newConfigName, setNewConfigName] = useState("");
  const [newConfigSku, setNewConfigSku] = useState("");
  const [newConfigStationId, setNewConfigStationId] = useState("");
  const [newConfigArtType, setNewConfigArtType] = useState("standard_canvas");
  const [newConfigMatSku, setNewConfigMatSku] = useState("");
  const [newConfigMatQty, setNewConfigMatQty] = useState("1.00");

  // Form states for beds
  const [newBedName, setNewBedName] = useState("");
  const [newBedWidth, setNewBedWidth] = useState("335");
  const [newBedHeight, setNewBedHeight] = useState("90");

  // Form states for inventory
  const [newInvName, setNewInvName] = useState("");
  const [newInvSku, setNewInvSku] = useState("");
  const [newInvQty, setNewInvQty] = useState("100.00");
  const [newInvUnit, setNewInvUnit] = useState("pcs");
  const [newInvThreshold, setNewInvThreshold] = useState("10.00");
  const [newInvCost, setNewInvCost] = useState("1.00");

  // Status/Loader states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [globalNotify, setGlobalNotify] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Filter & Search in Queue
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Webhook form simulator inputs
  const [webhookCustomerName, setWebhookCustomerName] = useState("Karolis Marcinkus");
  const [webhookCustomerEmail, setWebhookCustomerEmail] = useState("karolis@marcinkus.lt");
  const [webhookProductTitle, setWebhookProductTitle] = useState("Foto drobė Premium 50x70cm");
  const [webhookSku, setWebhookSku] = useState("CANVAS-5070-PREM");
  const [webhookPrice, setWebhookPrice] = useState("145.00");
  const [webhookQty, setWebhookQty] = useState(1);
  const [webhookShipping, setWebhookShipping] = useState("6.90");
  const [webhookLog, setWebhookLog] = useState<Array<{ time: string; type: "sent" | "received" | "error" | "hmac"; text: string }>>([]);

  // Barcode / QR Scan Simulation
  const [scannedCode, setScannedCode] = useState("");
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Active viewing modals
  const [activeLabelUrl, setActiveLabelUrl] = useState<string | null>(null);
  const [activeInvoiceText, setActiveInvoiceText] = useState<string | null>(null);

  // Inventory replenishment input
  const [replenishQty, setReplenishQty] = useState<{ [key: string]: string }>({});

  // Fetch initial API state
  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      const [resOrders, resInv, resInvoices, resEmails, resFinance, resStations, resConfigs] = await Promise.all([
        fetch("/api/orders").then(r => r.json()),
        fetch("/api/inventory").then(r => r.json()),
        fetch("/api/invoices").then(r => r.json()),
        fetch("/api/emails/logs").then(r => r.json()),
        fetch("/api/finance/monthly-summary").then(r => r.json()),
        fetch("/api/stations").then(r => r.json()),
        fetch("/api/products/configs").then(r => r.json())
      ]);

      setOrders(resOrders);
      setInventory(resInv);
      setInvoices(resInvoices);
      setEmailLogs(resEmails);
      setFinanceSummary(resFinance);
      setStationsList(resStations);
      setProductConfigs(resConfigs);
    } catch (err) {
      console.error("Klaida nuskaitant ERP duomenis:", err);
      showNotification("error", "Nepavyko prisijungti prie Express backend serverio. Bandykite dar kartą.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchWorkerItems = async (stationId: string) => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/stations/${stationId}/items`);
      const data = await res.json();
      setWorkerItems(data);
    } catch (err) {
      console.error("Failed to fetch worker items:", err);
      showNotification("error", "Nepavyko atnaujinti stotelės užsakymų.");
    } finally {
      setRefreshing(false);
    }
  };

  const fetchStationBeds = async (stationId: string) => {
    try {
      const res = await fetch(`/api/stations/${stationId}/beds`);
      const data = await res.json();
      setStationBeds(data);
    } catch (err) {
      console.error("Failed to fetch station beds:", err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (userRole === "WORKER" && selectedStationId) {
      fetchWorkerItems(selectedStationId);
      fetchStationBeds(selectedStationId);
    }
  }, [userRole, selectedStationId]);

  const handleLogin = () => {
    if (selectedRole === "ADMIN") {
      setUserRole("ADMIN");
    } else {
      const matched = stationsList.find(s => s.id === tempStationId);
      if (matched) {
        setSelectedStationId(matched.id);
        setSelectedStationName(matched.name);
        setUserRole("WORKER");
      }
    }
  };

  const handleLogout = () => {
    setUserRole(null);
    setSelectedStationId(null);
    setSelectedStationName(null);
    setTempStationId("");
  };

  const handleUpdateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/order-items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        showNotification("success", `Prekės statusas atnaujintas į ${newStatus}.`);
        if (selectedStationId) {
          fetchWorkerItems(selectedStationId);
        }
        // Refresh orders and inventory
        fetch("/api/orders").then(r => r.json()).then(setOrders);
        fetch("/api/inventory").then(r => r.json()).then(setInventory);
      } else {
        showNotification("error", data.error || "Nepavyko atnaujinti prekės būsenos.");
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Klaida atnaujinant būseną.");
    }
  };

  const handleWorkerQRScan = async () => {
    if (!scannedCode) return;
    try {
      const matchedItem = workerItems.find(item => item.id === scannedCode || item.shopify_line_item_id === scannedCode);
      if (!matchedItem) {
        showNotification("error", "Šioje stotelėje nerasta prekė su tokiu kodu.");
        return;
      }
      await handleUpdateItemStatus(matchedItem.id, "PRINTED_AND_PACKED");
      setScannedCode("");
    } catch (err) {
      console.error(err);
      showNotification("error", "Klaida nuskaitant QR kodą.");
    }
  };

  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationCode) return;
    try {
      const res = await fetch("/api/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStationName,
          code: newStationCode,
          description: newStationDesc
        })
      });
      const data = await res.json();
      if (data.id) {
        showNotification("success", `Stotelė '${newStationName}' sėkmingai sukurta.`);
        setNewStationName("");
        setNewStationCode("");
        setNewStationDesc("");
        fetch("/api/stations").then(r => r.json()).then(setStationsList);
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Nepavyko sukurti stotelės.");
    }
  };

  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfigName || !newConfigSku || !newConfigStationId) return;
    try {
      const res = await fetch("/api/products/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newConfigName,
          sku_pattern: newConfigSku,
          station_id: newConfigStationId,
          artwork_generator_type: newConfigArtType,
          required_material_sku: newConfigMatSku || null,
          material_qty_per_item: parseFloat(newConfigMatQty) || 1.00
        })
      });
      const data = await res.json();
      if (data.id) {
        showNotification("success", `Taisyklė '${newConfigName}' sėkmingai sukurta.`);
        setNewConfigName("");
        setNewConfigSku("");
        setNewConfigStationId("");
        setNewConfigArtType("standard_canvas");
        setNewConfigMatSku("");
        setNewConfigMatQty("1.00");
        fetch("/api/products/configs").then(r => r.json()).then(setProductConfigs);
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Nepavyko sukurti taisyklės.");
    }
  };

  const handleToggleStationExpand = async (stationId: string) => {
    if (expandedStationId === stationId) {
      setExpandedStationId(null);
      setExpandedBedsList([]);
    } else {
      setExpandedStationId(stationId);
      try {
        const res = await fetch(`/api/stations/${stationId}/beds`);
        const data = await res.json();
        setExpandedBedsList(data);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setGlobalNotify({ type, message });
    setTimeout(() => {
      setGlobalNotify(null);
    }, 6000);
  };

  // 1. Shopify Webhook simulation execution
  const executeShopifyWebhookSimulation = async () => {
    try {
      const payloadId = Math.floor(100000 + Math.random() * 900000);
      
      const payload = {
        id: payloadId,
        email: webhookCustomerEmail,
        total_price: (parseFloat(webhookPrice) * webhookQty + parseFloat(webhookShipping)).toFixed(2),
        shipping_address: {
          first_name: webhookCustomerName.split(" ")[0] || "Klientas",
          last_name: webhookCustomerName.split(" ").slice(1).join(" ") || "Shopify",
          address1: "Konstitucijos pr. 21",
          city: "Vilnius",
          zip: "LT-08105"
        },
        shipping_lines: [
          {
            title: "Kurjeris (DPD)",
            price: webhookShipping
          }
        ],
        line_items: [
          {
            id: Date.now(),
            title: webhookProductTitle,
            sku: webhookSku,
            price: webhookPrice,
            quantity: webhookQty
          }
        ],
        customer: {
          first_name: webhookCustomerName.split(" ")[0] || "Klientas",
          last_name: webhookCustomerName.split(" ").slice(1).join(" ") || "Shopify",
          email: webhookCustomerEmail
        }
      };

      // Call API helper to sign the payload on the server using HMAC key
      const signRes = await fetch("/api/webhooks/shopify/simulate-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const signData = await signRes.json();
      const hmacSignature = signData.testHeader;

      // Log steps
      const updatedLogs = [
        { time: new Date().toLocaleTimeString(), type: "sent" as const, text: `Išsiųsta 'orders/create' Shopify webhook užklausa ID: ${payloadId}` },
        { time: new Date().toLocaleTimeString(), type: "hmac" as const, text: `Generuojamas HMAC SHA-256 parašas: ${hmacSignature.substring(0, 20)}...` },
        ...webhookLog
      ];
      setWebhookLog(updatedLogs);

      // Trigger actual POST webhook with computed HMAC header
      const webhookRes = await fetch("/api/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-SHA256": hmacSignature
        },
        body: JSON.stringify(payload)
      });

      const responseData = await webhookRes.json();

      if (webhookRes.ok) {
        setWebhookLog(prev => [
          { time: new Date().toLocaleTimeString(), type: "received" as const, text: `Gautas ATSAKYMAS 200 OK: ${JSON.stringify(responseData)}` },
          ...prev
        ]);
        showNotification("success", `Užsakymas ${responseData.order_id ? "sėkmingai sugeneruotas" : ""} per Shopify Webhook!`);
        fetchAllData();
      } else {
        setWebhookLog(prev => [
          { time: new Date().toLocaleTimeString(), type: "error" as const, text: `Klaida ${webhookRes.status}: ${JSON.stringify(responseData)}` },
          ...prev
        ]);
        showNotification("error", "Webhook validacija nepavyko. Patikrinkite parašą.");
      }

    } catch (err: any) {
      console.error("Webhook simulation error:", err);
      showNotification("error", "Klaida siunčiant webhook: " + err.message);
    }
  };

  // 2. Compile spaudos failas (DPI 300 CMYK)
  const compileArtwork = async (orderId: string) => {
    try {
      const res = await fetch("/api/production/generate-artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", "Spaudos maketas sėkmingai paruoštas 300 DPI CMYK formatu!");
        fetchAllData();
      } else {
        showNotification("error", data.error || "Nepavyko sugeneruoti maketo.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  // 3. QR code scanner simulator (READY -> PRINTED_AND_PACKED)
  const scanQrCode = async (orderId: string) => {
    try {
      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", `QR Nuskaitymas sėkmingas! Gamybinis užsakymas pažymėtas kaip atspausdintas ir supakuotas. Nurašytos žaliavos.`);
        setScannedCode("");
        setQrModalOpen(false);
        fetchAllData();
      } else {
        showNotification("error", data.error || "QR Nuskaitymas nepavyko.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  // 4. Invoices PDF generate & Email (Resend)
  const generateAndSendInvoice = async (orderId: string) => {
    try {
      showNotification("info", "Generuojama sąskaita-faktūra ir siunčiamas laiškas klientui...");
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", `Sąskaita ${data.invoice.invoice_number} sėkmingai išsiųsta adresu ${data.recipient}!`);
        fetchAllData();
      } else {
        showNotification("error", data.error || "Sąskaitos generavimas nepavyko.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  // Retry send invoice via email
  const resendInvoiceEmail = async (orderId: string) => {
    try {
      showNotification("info", "Pakartotinai siunčiama sąskaita-faktūra klientui...");
      const res = await fetch("/api/invoices/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", data.message);
        fetchAllData();
      } else {
        showNotification("error", data.error || "Sąskaitos siuntimas nepavyko.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  // 5. Courier labels & Shopify Fulfill
  const fulfillOrder = async (orderId: string) => {
    try {
      showNotification("info", "Kreipiamasi į kurjerio tarnybą sekimo numeriui gauti...");
      const res = await fetch("/api/production/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", `Užsakymas sėkmingai pažymėtas kaip išsiųstas! Sekimo Nr: ${data.trackingNumber}`);
        fetchAllData();
        // Open shipping label
        setActiveLabelUrl(data.shippingLabelUrl);
      } else {
        showNotification("error", data.error || "Fulfillment nepavyko.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  // 6. Replenish material inventory stock
  const replenishMaterial = async (itemId: string, name: string) => {
    const qty = replenishQty[itemId];
    if (!qty || isNaN(parseFloat(qty)) || parseFloat(qty) <= 0) {
      showNotification("error", "Įveskite teisingą teigiamą skaičių papildymui.");
      return;
    }

    try {
      const res = await fetch("/api/inventory/replenish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, amount: parseFloat(qty) })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", `Žaliava "${name}" sėkmingai papildyta!`);
        setReplenishQty(prev => ({ ...prev, [itemId]: "" }));
        fetchAllData();
      } else {
        showNotification("error", data.error || "Papildymas nepavyko.");
      }
    } catch (err) {
      showNotification("error", "Ryšio klaida.");
    }
  };

  const handleAddInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInvName || !newInvSku || !newInvQty) {
      showNotification("error", "Prašome užpildyti visus privalomus laukelius.");
      return;
    }
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_name: newInvName,
          sku: newInvSku,
          quantity_remaining: parseFloat(newInvQty) || 0.00,
          unit: newInvUnit,
          critical_threshold: parseFloat(newInvThreshold) || 10.00,
          cost_per_unit: parseFloat(newInvCost) || 0.00
        })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification("success", `Žaliava '${newInvName}' sėkmingai sukurta.`);
        setNewInvName("");
        setNewInvSku("");
        setNewInvQty("100.00");
        setNewInvUnit("pcs");
        setNewInvThreshold("10.00");
        setNewInvCost("1.00");
        fetchAllData();
      } else {
        showNotification("error", data.error || "Nepavyko sukurti žaliavos.");
      }
    } catch (err) {
      console.error(err);
      showNotification("error", "Nepavyko sukurti žaliavos.");
    }
  };

  // Reset entire simulation DB
  const resetDatabase = async () => {
    if (confirm("Ar tikrai norite atstatyti gamyklinius pavyzdinius sistemos duomenis?")) {
      try {
        const res = await fetch("/api/system/reset", { method: "POST" });
        if (res.ok) {
          showNotification("success", "Duomenų bazė sėkmingai išvalyta ir atstatyta!");
          fetchAllData();
        }
      } catch (err) {
        showNotification("error", "Ryšio klaida.");
      }
    }
  };

  // Filter & Search logic for list
  const filteredOrders = orders.filter(order => {
    const matchesFilter = statusFilter === "ALL" || order.status === statusFilter;
    const matchesSearch = 
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.order_items.some(i => i.product_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      order.order_items.some(i => i.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStation = adminStationFilter === "ALL" || order.order_items.some(i => i.station_id === adminStationFilter);
    return matchesFilter && matchesSearch && matchesStation;
  });

  // Calculate stats
  const pendingArtworkCount = orders.filter(o => o.status === "PENDING_ARTWORK").length;
  const readyProductionCount = orders.filter(o => o.status === "READY_FOR_PRODUCTION").length;
  const criticalStockCount = inventory.filter(i => i.quantity_remaining < i.critical_threshold).length;

  if (userRole === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#090d16] text-slate-100 font-sans relative overflow-hidden">
        {/* Sleek radial glowing background */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/15 rounded-full filter blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[500px] h-[500px] bg-emerald-600/10 rounded-full filter blur-[120px] pointer-events-none"></div>

        <div className="w-full max-w-md p-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-3xl shadow-2xl relative z-10 space-y-7 animate-fadeIn">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/25">
              <Layers className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white mt-4 bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Printflow ERP
              </h1>
              <p className="text-slate-400 text-xs mt-1">Išmanioji gamybos ir sandėlio valdymo sistema</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block mb-1">Pasirinkite naudotojo paskyrą</label>
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => { setSelectedRole("ADMIN"); }}
                  className={`p-4 rounded-2xl border text-xs font-bold flex flex-col items-center gap-3 transition-all duration-200 cursor-pointer ${
                    selectedRole === "ADMIN" 
                      ? "border-indigo-500 bg-indigo-600/10 text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                      : "border-slate-800 hover:border-slate-700 bg-slate-900/40 text-slate-400"
                  }`}
                >
                  <TrendingUp className={`w-5 h-5 transition-transform duration-200 ${selectedRole === "ADMIN" ? "scale-110 text-indigo-400" : ""}`} />
                  Administratorius
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedRole("WORKER"); }}
                  className={`p-4 rounded-2xl border text-xs font-bold flex flex-col items-center gap-3 transition-all duration-200 cursor-pointer ${
                    selectedRole === "WORKER" 
                      ? "border-indigo-500 bg-indigo-600/10 text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                      : "border-slate-800 hover:border-slate-700 bg-slate-900/40 text-slate-400"
                  }`}
                >
                  <QrCode className={`w-5 h-5 transition-transform duration-200 ${selectedRole === "WORKER" ? "scale-110 text-indigo-400" : ""}`} />
                  Gamybos darbuotojas
                </button>
              </div>
            </div>

            {selectedRole === "WORKER" && (
              <div className="space-y-2 animate-fadeIn">
                <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">Pasirinkite darbo stotelę</label>
                <select
                  value={tempStationId}
                  onChange={(e) => {
                    setTempStationId(e.target.value);
                  }}
                  className="w-full bg-slate-950/80 border border-slate-800 text-slate-200 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">Pasirinkite gamybos stotelę...</option>
                  {stationsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={selectedRole === "WORKER" && !tempStationId}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-xs py-4 rounded-2xl transition-all duration-200 shadow-xl shadow-indigo-600/20 cursor-pointer"
            >
              Prisijungti prie sistemos
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (userRole === "WORKER") {
    return (
      <div className="h-screen w-screen overflow-hidden flex bg-slate-50 font-sans selection:bg-indigo-500 selection:text-white">
        {/* GLOBAL TOP STATUS NOTIFICATION */}
        {globalNotify && (
          <div className={`fixed top-4 right-4 z-50 p-3.5 rounded-lg shadow-xl border text-xs max-w-sm flex items-start gap-2.5 transition-all animate-bounce bg-white text-slate-800`}>
            {globalNotify.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <div>
              <p className="font-bold">{globalNotify.type === "success" ? "Atlikta sėkmingai" : "Sistemos klaida"}</p>
              <p className="mt-0.5 text-[10px] leading-normal opacity-90">{globalNotify.message}</p>
            </div>
          </div>
        )}

        {/* Minimalist Sidebar */}
        <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
          <div className="p-4 flex items-center gap-3 border-b border-slate-800 shrink-0">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold text-white shadow-inner">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black leading-none text-sm tracking-tight">Printflow</span>
              <span className="text-[10px] opacity-60 mt-1 uppercase tracking-wider">Gamybos stotelė</span>
            </div>
          </div>

          <div className="flex-1 p-4 space-y-4">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-slate-500">Pasirinkta stotelė</p>
              <p className="text-xs text-white font-bold">{selectedStationName}</p>
              <p className="text-[10px] text-slate-400">Aktyvių užsakymų stotelėje: {workerItems.length}</p>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => setActiveWorkerTab("production")}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
                  activeWorkerTab === "production"
                    ? "bg-slate-800 text-white font-bold"
                    : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Gamybos eilė</span>
              </button>

              <button
                onClick={() => setActiveWorkerTab("shipping")}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
                  activeWorkerTab === "shipping"
                    ? "bg-slate-800 text-white font-bold"
                    : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Siuntimo langas</span>
                <span className="ml-auto bg-emerald-600 text-white font-mono px-1.5 py-0.5 rounded text-[9px]">
                  {orders.filter(o => o.status === "PRINTED_AND_PACKED").length}
                </span>
              </button>
            </nav>
          </div>

          <div className="p-4 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 font-semibold text-xs py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              Atsijungti
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden text-slate-800">
          <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
            <div>
              <h1 className="text-sm font-bold text-slate-900">
                {selectedStationName} {activeWorkerTab === "production" ? "gamybos eilė" : "siuntimo langas"}
              </h1>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {activeWorkerTab === "production" 
                  ? "Nuskaitykite QR kodus arba spausdinkite prekes žingsnis po žingsnio" 
                  : "Paruoštų užsakymų išsiuntimas ir lipdukų spausdinimas"}
              </p>
            </div>
            <button
              onClick={() => {
                fetchWorkerItems(selectedStationId!);
                fetch("/api/orders").then(r => r.json()).then(setOrders);
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Atnaujinti
            </button>
          </header>

          {activeWorkerTab === "production" ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Quick QR barcode simulator */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  Greitasis QR / Barkodų skaitytuvas stotelėje
                </h2>
                <p className="text-[10px] text-slate-500">
                  Nuskenuokite gaminio ID, kad akimirksniu pažymėtumėte gamybą kaip baigtą ir nurašytumėte reikalingas detales.
                </p>
                <div className="flex gap-2.5">
                  <input
                    type="text"
                    placeholder="Nuskenuokite arba įveskite gaminio ID (pvz., item-1)"
                    value={scannedCode}
                    onChange={(e) => setScannedCode(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                  <button
                    onClick={handleWorkerQRScan}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Nuskaityti QR
                  </button>
                </div>
              </div>

              {/* List and wizard split */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Queue */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                      <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Užsakymų prekės gamybai</h3>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                      {workerItems.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          Šiuo metu stotelėje nėra laukiančių užsakymų.
                        </div>
                      ) : (
                        workerItems.map((item) => (
                          <div 
                            key={item.id} 
                            onClick={() => {
                              setActiveWorkerItemId(item.id);
                              if (!workerSteps[item.id]) {
                                setWorkerSteps(prev => ({ ...prev, [item.id]: 1 }));
                              }
                            }}
                            className={`p-4 flex items-start justify-between hover:bg-slate-50 transition-colors cursor-pointer border-l-4 ${
                              activeWorkerItemId === item.id ? 'border-indigo-600 bg-indigo-50/20' : 'border-transparent'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{item.orders?.order_number}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  item.status === "PENDING_ARTWORK" 
                                    ? "bg-amber-100 text-amber-800"
                                    : item.status === "READY_FOR_PRODUCTION"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-purple-100 text-purple-800"
                                }`}>
                                  {item.status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-semibold">{item.quantity}x {item.product_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">SKU: {item.sku} | ID: {item.id}</p>
                            </div>
                            
                            <div className="flex gap-2">
                              {item.status === "PENDING_ARTWORK" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateItemStatus(item.id, "READY_FOR_PRODUCTION");
                                  }}
                                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded transition-colors cursor-pointer"
                                >
                                  Patvirtinti
                                </button>
                              )}
                              {item.status === "READY_FOR_PRODUCTION" && (
                                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded">
                                  Pradėti spaudą →
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Right wizard column */}
                <div className="space-y-4">
                  {(() => {
                    const selectedItem = workerItems.find(i => i.id === activeWorkerItemId);
                    if (selectedItem) {
                      const step = workerSteps[selectedItem.id] || 1;
                      const matchedRule = productConfigs.find(c => {
                        const pattern = c.sku_pattern.replace(/\*/g, ".*");
                        const regex = new RegExp(`^${pattern}$`, "i");
                        return regex.test(selectedItem.sku);
                      });

                      let reqMaterial: any = null;
                      let reqQty = 0;
                      let hasEnough = true;

                      if (matchedRule && matchedRule.required_material_sku) {
                        reqMaterial = inventory.find(m => m.sku === matchedRule.required_material_sku);
                        reqQty = parseFloat(matchedRule.material_qty_per_item || "1.00") * selectedItem.quantity;
                        if (reqMaterial) {
                          hasEnough = parseFloat(reqMaterial.quantity_remaining) >= reqQty;
                        } else {
                          hasEnough = false;
                        }
                      }

                      return (
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div>
                              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Gamybos vedlys</h3>
                              <p className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]">{selectedItem.product_name}</p>
                            </div>
                            <button
                              onClick={() => setActiveWorkerItemId(null)}
                              className="text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
                            >
                              Uždaryti
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4].map(s => (
                              <div 
                                key={s} 
                                className={`flex-1 h-1.5 rounded-full transition-all ${
                                  step >= s ? 'bg-indigo-600' : 'bg-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            Žingsnis {step} iš 4
                          </div>

                          {step === 1 && (
                            <div className="space-y-3">
                              <p className="text-xs font-bold text-slate-900">1. Pasirinkite spausdinimo stalo dydį:</p>
                              <p className="text-[10px] text-slate-500">Pasirinkite, koks stalas šiuo metu įdėtas į įrenginį gamybai:</p>
                              <div className="space-y-2">
                                {stationBeds.length === 0 ? (
                                  [
                                    { id: "mini", name: "Mini FlatBed (335 × 90 mm)" },
                                    { id: "standart", name: "Standart FlatBed (335 × 420 mm)" }
                                  ].map(bed => (
                                    <button
                                      key={bed.id}
                                      onClick={() => setSelectedBedId(bed.name)}
                                      className={`w-full p-3 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                                        selectedBedId === bed.name
                                          ? "border-indigo-600 bg-indigo-50/20 text-indigo-900 font-bold"
                                          : "border-slate-200 hover:border-slate-350 text-slate-700 bg-slate-50"
                                      }`}
                                    >
                                      {bed.name}
                                    </button>
                                  ))
                                ) : (
                                  stationBeds.map(bed => (
                                    <button
                                      key={bed.id}
                                      onClick={() => setSelectedBedId(bed.name)}
                                      className={`w-full p-3 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                                        selectedBedId === bed.name
                                          ? "border-indigo-600 bg-indigo-50/20 text-indigo-900 font-bold"
                                          : "border-slate-200 hover:border-slate-350 text-slate-700 bg-slate-50"
                                      }`}
                                    >
                                      {bed.name} ({bed.width_mm} × {bed.height_mm} mm)
                                    </button>
                                  ))
                                )}
                              </div>

                              <button
                                disabled={!selectedBedId}
                                onClick={() => setStep(selectedItem.id, 2)}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-lg disabled:opacity-50 cursor-pointer transition-all"
                              >
                                Toliau
                              </button>
                            </div>
                          )}

                          {step === 2 && (
                            <div className="space-y-4">
                              <p className="text-xs font-bold text-slate-900">2. Sugeneruokite spaudos failą:</p>
                              <p className="text-[10px] text-slate-500">
                                Gamybos failas bus generuojamas pritaikytas stalui: <span className="font-bold text-indigo-600">{selectedBedId}</span>
                              </p>

                              {!selectedItem.artwork_file_url ? (
                                <button
                                  onClick={async () => {
                                    setGeneratingPrintfile(true);
                                    try {
                                      const res = await fetch("/api/production/generate-printfile", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ itemId: selectedItem.id, bedName: selectedBedId })
                                      });
                                      const data = await res.json();
                                      if (data.success) {
                                        showNotification("success", "Spaudos failas sugeneruotas!");
                                        fetchWorkerItems(selectedStationId!);
                                      }
                                    } catch (err) {
                                      showNotification("error", "Klaida generuojant failą.");
                                    } finally {
                                      setGeneratingPrintfile(false);
                                    }
                                  }}
                                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                                >
                                  <RefreshCw className={`w-4 h-4 ${generatingPrintfile ? 'animate-spin' : ''}`} />
                                  {generatingPrintfile ? "Generuojama..." : "Generuoti spaudos failą (PDF)"}
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <a
                                    href={selectedItem.artwork_file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                                  >
                                    <Download className="w-4 h-4" />
                                    Atsisiųsti PDF maketą
                                  </a>
                                </div>
                              )}

                              <div className="flex gap-2">
                                <button
                                  onClick={() => setStep(selectedItem.id, 1)}
                                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-lg cursor-pointer transition-all"
                                >
                                  Atgal
                                </button>
                                <button
                                  disabled={!selectedItem.artwork_file_url}
                                  onClick={() => setStep(selectedItem.id, 3)}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-lg disabled:opacity-50 cursor-pointer transition-all"
                                >
                                  Toliau
                                </button>
                              </div>
                            </div>
                          )}

                          {step === 3 && (
                            <div className="space-y-4">
                              <p className="text-xs font-bold text-slate-900">3. Klijavimo detalės & Sandėlis:</p>
                              
                              {matchedRule && matchedRule.required_material_sku ? (
                                <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-3">
                                  <div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Reikalaujama gaminio bazė</p>
                                    <p className="text-xs font-bold text-slate-800">{reqMaterial?.material_name || matchedRule.required_material_sku}</p>
                                    <p className="text-[9px] text-slate-400 font-mono">SKU: {matchedRule.required_material_sku}</p>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-[11px]">
                                    <div>
                                      <p className="text-slate-500 font-semibold">Reikia kiekiui ({selectedItem.quantity} vnt.):</p>
                                      <p className="font-black text-slate-900">{reqQty} vnt.</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-slate-500 font-semibold">Likutis sandėlyje:</p>
                                      <p className={`font-black ${hasEnough ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {reqMaterial ? parseFloat(reqMaterial.quantity_remaining).toFixed(1) : 0} vnt.
                                      </p>
                                    </div>
                                  </div>
                                  <div className={`text-[10px] font-bold p-1.5 rounded-lg text-center ${
                                    hasEnough ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                                  }`}>
                                    {hasEnough ? "✓ Likutis pakankamas" : "✗ DĖMESIO: Nepakanka detalių!"}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">Šiam SKU klijavimo bazių receptūra nenustatyta.</p>
                              )}

                              <div className="flex gap-2">
                                <button
                                  onClick={() => setStep(selectedItem.id, 2)}
                                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-lg cursor-pointer transition-all"
                                >
                                  Atgal
                                </button>
                                <button
                                  onClick={() => setStep(selectedItem.id, 4)}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-lg cursor-pointer transition-all"
                                >
                                  Toliau
                                </button>
                              </div>
                            </div>
                          )}

                          {step === 4 && (
                            <div className="space-y-4">
                              <p className="text-xs font-bold text-slate-900">4. Užbaigti gamybą:</p>
                              <p className="text-[10px] text-slate-500">
                                Patvirtinkite, kad gaminys pilnai atspausdintas ir paruoštas siuntimui. Sandėlio likutis bus nurašytas automatiškai.
                              </p>

                              <button
                                onClick={async () => {
                                  await handleUpdateItemStatus(selectedItem.id, "PRINTED_AND_PACKED");
                                  setActiveWorkerItemId(null);
                                  // Verify if order is completed
                                  const remaining = workerItems.filter(i => i.id !== selectedItem.id && i.status !== "PRINTED_AND_PACKED" && i.order_id === selectedItem.order_id);
                                  if (remaining.length === 0) {
                                    showNotification("success", `Gamyba baigta. Užsakymas paruoštas išsiuntimui!`);
                                    setActiveWorkerTab("shipping");
                                  }
                                }}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Patvirtinti gamybos pabaigą
                              </button>

                              <button
                                onClick={() => setStep(selectedItem.id, 3)}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2 rounded-lg cursor-pointer transition-all"
                              >
                                Atgal
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Default render: inventory levels
                    return (
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sandėlio likučiai</h3>
                        <div className="space-y-3">
                          {inventory.map((mat) => (
                            <div key={mat.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-slate-700">{mat.material_name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">SKU: {mat.sku}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-900">
                                  {parseFloat(mat.quantity_remaining.toString()).toFixed(1)} {mat.unit}
                                </p>
                                {mat.quantity_remaining < mat.critical_threshold && (
                                  <span className="text-[8px] font-black uppercase text-rose-600 bg-rose-50 px-1 py-0.5 rounded">Reikia papildyti</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            // DEDICATED SHIPPING TAB
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  Paruoštų užsakymų išsiuntimas (Fulfillment)
                </h2>
                <p className="text-[10px] text-slate-500">
                  Užbaikite užsakymus, kurių visos dalys jau yra pagamintos. Paspaudus "Išsiųsti", sugeneruojamas DPD lipdukas.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Orders list */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                      <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Laukia išsiuntimo</h3>
                    </div>

                    <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                      {orders.filter(o => o.status === "PRINTED_AND_PACKED").length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          Šiuo metu nėra užsakymų paruoštų siuntimui.
                        </div>
                      ) : (
                        orders.filter(o => o.status === "PRINTED_AND_PACKED").map((order) => (
                          <div key={order.id} className="p-4 flex items-start justify-between hover:bg-slate-50/30 transition-colors">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{order.order_number}</span>
                                <span className="text-[9px] bg-purple-100 text-purple-800 font-bold uppercase px-1.5 py-0.2 rounded">Paruoštas</span>
                              </div>
                              <p className="text-xs font-bold text-slate-800">{order.customer_name}</p>
                              <p className="text-[10px] text-slate-500">
                                Adresas: {order.shipping_address?.city || ""}, {order.shipping_address?.address || order.shipping_address?.address1 || ""}
                              </p>
                            </div>

                            <button
                              onClick={() => fulfillOrder(order.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-3.5 py-2 rounded transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Išsiųsti
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Sidebar details */}
                <div className="space-y-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Lipdukų spausdinimas</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">
                      Užsakymo išsiuntimo metu bus automatiškai atidarytas siuntos sekimo važtaraščio langas.
                    </p>
                    <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-[10px]">
                      Nuskenuokite arba paspauskite išsiuntimo mygtuką užsakymui užbaigti.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-50 font-sans selection:bg-indigo-500 selection:text-white">
      
      {/* GLOBAL TOP STATUS NOTIFICATION */}
      {globalNotify && (
        <div className={`fixed top-4 right-4 z-50 p-3.5 rounded-lg shadow-xl border text-xs max-w-sm flex items-start gap-2.5 transition-all animate-bounce ${
          globalNotify.type === "success" 
            ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
            : globalNotify.type === "error" 
            ? "bg-rose-50 border-rose-200 text-rose-950" 
            : "bg-blue-50 border-blue-200 text-blue-950"
        }`}>
          {globalNotify.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          {globalNotify.type === "error" && <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
          {globalNotify.type === "info" && <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 animate-spin" />}
          <div>
            <p className="font-bold">{globalNotify.type === "success" ? "Atlikta sėkmingai" : globalNotify.type === "error" ? "Sistemos klaida" : "Apdirbama užklausa"}</p>
            <p className="mt-0.5 text-[10px] leading-normal opacity-90">{globalNotify.message}</p>
          </div>
        </div>
      )}

      {/* DARK SIDEBAR (LEFT) */}
      <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col shrink-0 border-r border-slate-800">
        {/* Brand Header */}
        <div className="p-4 flex items-center gap-3 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center font-bold text-white shadow-inner">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-black leading-none text-sm tracking-tight">Printflow ERP</span>
              <span className="text-[9px] font-bold bg-indigo-500 text-white px-1 py-0.2 rounded uppercase tracking-wider">M-SaaS</span>
            </div>
            <span className="text-[10px] opacity-60 mt-0.5">v1.4 • Gamybos centras</span>
          </div>
        </div>

        {/* Sidebar Nav items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Valdymas</div>
          
          <button
            onClick={() => setActiveTab("production")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "production"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Gamyba & Užsakymai</span>
            <span className="ml-auto bg-indigo-600 text-white font-mono px-1.5 py-0.5 rounded text-[9px]">{orders.length}</span>
          </button>

          <button
            onClick={() => setActiveTab("webhook")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "webhook"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Shopify Webhook</span>
            <span className="ml-auto bg-emerald-600/80 text-white font-mono px-1.5 py-0.5 rounded text-[9px]">Test</span>
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "inventory"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Sandėlio apskaita</span>
            {criticalStockCount > 0 && (
              <span className="ml-auto bg-rose-500 text-white font-mono px-1.5 py-0.5 rounded text-[9px] animate-pulse">!</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("finance")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "finance"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Finansų ERP & SQL</span>
          </button>

          <button
            onClick={() => setActiveTab("emails")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "emails"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mail className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Resend El. paštas</span>
            <span className="ml-auto bg-purple-600/80 text-white font-mono px-1.5 py-0.5 rounded text-[9px]">{emailLogs.length}</span>
          </button>

          <button
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer w-full text-left ${
              activeTab === "config"
                ? "bg-slate-800 text-white font-bold"
                : "hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Database className="w-4 h-4 text-amber-500 shrink-0" />
            <span>SaaS & Stotelės</span>
          </button>

          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-6 mb-2 px-2">Sistemos būsena</div>
          <div className="px-3 py-1 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Shopify API
            </span>
            <span className="opacity-55">Stable</span>
          </div>
          <div className="px-3 py-1 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> DB Actions
            </span>
            <span className="opacity-55">Active</span>
          </div>
          <div className="px-3 py-1 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span> Resend API
            </span>
            <span className="opacity-55">Online</span>
          </div>
        </nav>

        {/* Sidebar Footer Usage & Profile */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 shrink-0 flex flex-col gap-2">
          <div className="text-[10px] text-slate-400">
            <div className="flex justify-between mb-1">
              <span>DB Užimtumas</span>
              <span>44%</span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full">
              <div className="bg-indigo-500 h-1 rounded-full w-[44%]"></div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-300 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold truncate text-slate-200">lukas.ku1598@gmail.com</p>
              <p className="opacity-55 text-[9px] mt-0.5">Rolė: ERP Admin</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-[9px] font-bold bg-slate-800 hover:bg-slate-700 hover:text-white px-2 py-1 rounded text-slate-400 cursor-pointer shrink-0 ml-2"
            >
              Išeiti
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN RIGHT COLUMN CONTAINER */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
        {/* Elegant Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="text-slate-800 font-bold text-sm">Gamybos valdymo skydas</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500 flex items-center gap-1">
              {activeTab === "production" && "Gamyba & Užsakymai"}
              {activeTab === "webhook" && "Shopify Webhook Testeris"}
              {activeTab === "inventory" && "Sandėlis & Žaliavos"}
              {activeTab === "finance" && "Pelningumas & SQL"}
              {activeTab === "emails" && "Resend Laiškų Žurnalas"}
            </span>
          </div>
          
          <div className="flex items-center gap-2.5">
            <button 
              onClick={fetchAllData}
              disabled={refreshing}
              className="px-3 py-1.5 bg-white border border-slate-250 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Atnaujinti
            </button>
            <button 
              onClick={resetDatabase}
              className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors text-xs font-bold cursor-pointer shadow-xs"
            >
              Išvalyti DB
            </button>
          </div>
        </header>

        {/* Content Zone Grid & Stats row */}
        <div className="flex-1 p-4 lg:p-5 flex flex-col gap-4 overflow-hidden bg-slate-50">
          {/* Top 4 Compact Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            <div className="bg-white border border-slate-150 rounded-2xl p-4 flex items-center justify-between shadow-xs transition-all hover:shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Laukia maketų</span>
                <span className="text-xl font-extrabold text-slate-900 mt-1 block">{pendingArtworkCount} užsak.</span>
                <span className="text-[9px] text-amber-700 bg-amber-50/70 px-1.5 py-0.5 rounded font-mono font-bold mt-1 inline-block">Awaiting Artwork</span>
              </div>
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                <Printer className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white border border-slate-150 rounded-2xl p-4 flex items-center justify-between shadow-xs transition-all hover:shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gamybos eilė</span>
                <span className="text-xl font-extrabold text-slate-900 mt-1 block">{readyProductionCount} užsak.</span>
                <span className="text-[9px] text-indigo-700 bg-indigo-50/70 px-1.5 py-0.5 rounded font-mono font-bold mt-1 inline-block">Ready for Print</span>
              </div>
              <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white border border-slate-150 rounded-2xl p-4 flex items-center justify-between shadow-xs transition-all hover:shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kritinės žaliavas</span>
                <span className="text-xl font-extrabold text-slate-900 mt-1 block">{criticalStockCount} pozic.</span>
                <span className="text-[9px] text-rose-700 bg-rose-50/75 px-1.5 py-0.5 rounded font-mono font-bold mt-1 inline-block">Requires Attention!</span>
              </div>
              <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white border border-slate-150 rounded-2xl p-4 flex items-center justify-between shadow-xs transition-all hover:shadow-sm">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Apyvarta</span>
                <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                  {financeSummary ? `${financeSummary.totalRevenue.toFixed(2)} €` : "0.00 €"}
                </span>
                <span className="text-[9px] text-emerald-755 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-bold mt-1 inline-block">
                  Margin: {financeSummary ? `${financeSummary.profitMarginPercent}%` : "34.2%"}
                </span>
              </div>
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* ACTIVE CONTENT CARD WITH PORT LOADING INDICATORS */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {loading ? (
              <div className="m-auto py-24 text-center bg-white border border-slate-200 rounded-lg p-12 w-full max-w-lg">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
                <p className="font-semibold text-slate-700 text-sm">Kraunami Printflow ERP duomenys...</p>
                <p className="text-xs text-slate-400 mt-1">Palaukite, jungiamos Supabase ir Shopify gamybinės eilės</p>
              </div>
            ) : (
            <>
              {/* TAB 1: PRODUCTION QUEUE */}
              {activeTab === "production" && (
                <div className="flex-1 flex gap-4 overflow-hidden h-full">
                  {/* Left panel: Queue */}
                  <div className="flex-1 flex flex-col min-w-0 bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden h-full">
                    
                    {/* Header */}
                    <div className="p-4 border-b border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">Užsakymų gamybos ir siuntimo eilė</h2>
                        <p className="text-[11px] text-slate-500 mt-0.5">Valdykite Shopify pirkėjų užsakymų gamybos ciklą, kurjerius ir sąskaitas</p>
                      </div>
                      
                      {/* Barcode / QR simulator button */}
                      <button
                        onClick={() => setQrModalOpen(true)}
                        className="bg-slate-900 hover:bg-slate-850 text-white font-semibold text-[11px] px-3 py-1.5 rounded flex items-center gap-1.5 border border-slate-800 hover:shadow transition-all cursor-pointer shadow-xs"
                      >
                        <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                        QR Nuskaitymo imitatorius
                      </button>
                    </div>

                    {/* FILTER AND SEARCH BAR */}
                    <div className="p-3 bg-slate-50 border-b border-slate-150 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 shrink-0">
                      <div className="flex flex-wrap gap-1">
                        {[
                          { label: "Visi", value: "ALL" },
                          { label: "Laukia maketo", value: "PENDING_ARTWORK" },
                          { label: "Spaudai", value: "READY_FOR_PRODUCTION" },
                          { label: "Supakuota", value: "PRINTED_AND_PACKED" },
                          { label: "Išsiųsta", value: "FULFILLED" }
                        ].map(f => (
                          <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                              statusFilter === f.value
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5 mr-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Stotelė:</span>
                        <select
                          value={adminStationFilter}
                          onChange={(e) => setAdminStationFilter(e.target.value)}
                          className="bg-transparent border-none text-[10px] text-slate-700 font-bold focus:outline-none cursor-pointer"
                        >
                          <option value="ALL">Visos</option>
                          {stationsList.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input 
                          type="text" 
                          placeholder="Ieškoti pagal pirkėją, SKU, prekę..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-white border border-slate-200 rounded pl-7 pr-2.5 py-1 text-[11px] w-full md:w-56 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                        />
                      </div>
                    </div>

                    {/* ACTIVE ORDERS LIST */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/30">
                    {filteredOrders.length === 0 ? (
                      <div className="py-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="font-semibold text-sm text-slate-600">Nėra jokių užsakymų šioje skiltyje</p>
                        <p className="text-xs text-slate-400 mt-1">Eikite į "Shopify Webhook" skiltį ir imituokite naujo užsakymo gavimą</p>
                      </div>
                    ) : (
                      filteredOrders.map(order => {
                        const associatedInvoice = invoices.find(i => i.order_id === order.id);
                        return (
                          <div 
                            key={order.id} 
                            className="border border-slate-200 rounded-xl hover:shadow-md transition-shadow bg-white overflow-hidden"
                          >
                            {/* Card Header */}
                            <div className="bg-slate-50/70 border-b border-slate-100 px-4 py-3 flex flex-wrap justify-between items-center gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900 text-sm">{order.order_number}</span>
                                <span className="text-[10px] text-slate-400 font-mono">ID: {order.id}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  order.status === "PENDING_ARTWORK"
                                    ? "bg-amber-100 text-amber-900 border border-amber-200"
                                    : order.status === "READY_FOR_PRODUCTION"
                                    ? "bg-blue-100 text-blue-900 border border-blue-200"
                                    : order.status === "PRINTED_AND_PACKED"
                                    ? "bg-purple-100 text-purple-900 border border-purple-200"
                                    : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                }`}>
                                  {order.status === "PENDING_ARTWORK" && "Laukia spaudos failo"}
                                  {order.status === "READY_FOR_PRODUCTION" && "Paruošta spaudai"}
                                  {order.status === "PRINTED_AND_PACKED" && "Supakuota / Paruošta siųsti"}
                                  {order.status === "FULFILLED" && "Išsiųsta pirkėjui"}
                                </span>
                              </div>
                            </div>

                            {/* Card Content */}
                            <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                              
                              {/* Left col: Customer & Products */}
                              <div className="md:col-span-8 space-y-3 border-r border-slate-100 pr-0 md:pr-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Užsakovas</span>
                                    <p className="font-semibold text-slate-800 text-sm">{order.customer_name}</p>
                                    <p className="text-xs text-slate-550 text-slate-500">{order.customer_email}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Pristatymo adresas</span>
                                    <p className="text-xs text-slate-700 font-semibold mt-0.5">
                                      {order.shipping_address?.city || ""}, {order.shipping_address?.address || order.shipping_address?.address1 || "Nenurodytas"}
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2 pt-2 border-t border-slate-50">
                                  <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Užsakytos prekės</span>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-100 text-slate-400 font-bold text-[9px] uppercase">
                                          <th className="pb-1.5">Gaminys</th>
                                          <th className="pb-1.5">SKU</th>
                                          <th className="pb-1.5 text-center">Kiekis</th>
                                          <th className="pb-1.5 text-right">Kaina</th>
                                          <th className="pb-1.5 text-right pl-4">Maketas</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {order.order_items.map(item => (
                                          <tr key={item.id} className="hover:bg-slate-50/50">
                                            <td className="py-2 font-semibold text-slate-800">{item.product_name}</td>
                                            <td className="py-2 font-mono text-[10px] text-indigo-600">{item.sku}</td>
                                            <td className="py-2 text-center font-bold text-slate-700">{item.quantity}</td>
                                            <td className="py-2 text-right font-mono text-slate-600">{item.price.toFixed(2)} €</td>
                                            <td className="py-2 text-right pl-4">
                                              {item.artwork_file_url ? (
                                                <a 
                                                  href={item.artwork_file_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700 font-bold hover:underline"
                                                >
                                                  <Printer className="w-3.5 h-3.5" />
                                                  Atsisiųsti
                                                </a>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                                                  <AlertTriangle className="w-3 h-3" />
                                                  Trūksta failo
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>

                              {/* Right col: Financial summary & Operations */}
                              <div className="md:col-span-4 flex flex-col justify-between space-y-4">
                                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Sumokėta</span>
                                    <p className="font-black text-slate-900 text-sm">{(order.total_price).toFixed(2)} €</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Savikaina</span>
                                    <p className="font-bold text-slate-600">{order.raw_materials_cost.toFixed(2)} €</p>
                                  </div>
                                  <div className="col-span-2 pt-1.5 border-t border-slate-200 flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase">Grynasis pelnas:</span>
                                    <span className="font-black text-emerald-600 text-sm">{order.net_profit.toFixed(2)} €</span>
                                  </div>
                                </div>

                                {/* OPERATIONS ACTION PORT */}
                                <div className="space-y-1.5 pt-2">
                                  <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider mb-1">Gamybos veiksmai</span>
                                  
                                  {order.status === "PENDING_ARTWORK" && (
                                    <button
                                      onClick={() => compileArtwork(order.id)}
                                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      Generuoti 300DPI spaudos failą
                                    </button>
                                  )}

                                  {order.status === "READY_FOR_PRODUCTION" && (
                                    <button
                                      onClick={() => scanQrCode(order.id)}
                                      className="w-full bg-slate-900 hover:bg-slate-850 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                                      Pažymėti atspausdintu (QR simuliacija)
                                    </button>
                                  )}

                                  {order.status === "PRINTED_AND_PACKED" && (
                                    <div className="space-y-1.5">
                                      <button
                                        onClick={() => fulfillOrder(order.id)}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                      >
                                        <Truck className="w-3.5 h-3.5" />
                                        Išsiųsti & Shopify Fulfill
                                      </button>
                                      
                                      {!associatedInvoice ? (
                                        <button
                                          onClick={() => generateAndSendInvoice(order.id)}
                                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                                          Išrašyti sąskaitą-faktūrą
                                        </button>
                                      ) : (
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => {
                                              setActiveInvoiceText(`
====================================================
               SĄSKAITA-FAKTŪRA
               Serija: INV-2026
====================================================
Pardavėjas:
UAB "Printflow ERP"
Kodas: 301294812, PVM: LT100003928412
Adresas: Gamyklos g. 12, Vilnius, Lietuva

Pirkėjas:
${order.customer_name} (${order.customer_email})
Užsakymo Nr.: ${order.order_number}
Data: 2026-06-24

PREKĖS IR PASLAUGOS:
----------------------------------------------------
1. ${order.order_items[0]?.product_name} - 1 vnt. x ${order.total_price.toFixed(2)} EUR
----------------------------------------------------
Viso apmokėta: ${order.total_price.toFixed(2)} EUR
====================================================
                                              `);
                                            }}
                                            className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-[10px] py-1.5 px-2 rounded-lg transition-colors cursor-pointer border border-emerald-200 flex items-center justify-center gap-1"
                                          >
                                            <Download className="w-3 h-3" />
                                            Atsisiųsti {associatedInvoice.invoice_number}
                                          </button>
                                          <button
                                            onClick={() => resendInvoiceEmail(order.id)}
                                            className="bg-purple-50 hover:bg-purple-100 text-purple-800 font-semibold text-[10px] py-1.5 px-2 rounded-lg transition-colors cursor-pointer border border-purple-200 flex items-center justify-center gap-1"
                                            title="Išsiųsti el. paštu pakartotinai"
                                          >
                                            <Mail className="w-3 h-3" />
                                            Siųsti vėl
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {order.status === "FULFILLED" && (
                                    <div className="space-y-1.5 text-xs text-slate-500">
                                      <div className="bg-emerald-50 text-emerald-850 p-2 rounded-lg border border-emerald-100 flex flex-col gap-1">
                                        <span className="font-semibold flex items-center gap-1 text-emerald-800">
                                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                          Užsakymas baigtas
                                        </span>
                                        <span className="font-mono text-[10px]">DHL tracking ID: {order.tracking_number}</span>
                                      </div>
                                      
                                      {order.shipping_label_url && (
                                        <button
                                          onClick={() => setActiveLabelUrl(order.shipping_label_url || "")}
                                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                                          Rodyti siuntos lipduką
                                        </button>
                                      )}

                                      {associatedInvoice && (
                                        <button
                                          onClick={() => resendInvoiceEmail(order.id)}
                                          className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
                                        >
                                          <Mail className="w-3.5 h-3.5 text-purple-500" />
                                          Siųsti sąskaitą klientui vėl
                                        </button>
                                      )}
                                    </div>
                                  )}

                                </div>
                              </div>

                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                  {/* Right Sidebar panel */}
                  <aside className="w-80 hidden xl:flex flex-col gap-4 overflow-y-auto shrink-0 h-full">
                    
                    {/* Critical Stock */}
                    <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex flex-col max-h-[50%] overflow-hidden bg-gradient-to-b from-white to-slate-50/30">
                      <div className="text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center justify-between tracking-wider">
                        <span>Kritinis sandėlis</span>
                        <span className="text-[9px] text-rose-500 font-mono font-extrabold px-1 bg-rose-50 border border-rose-100 rounded">CRITICAL</span>
                      </div>
                      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                        {inventory.filter(i => i.quantity_remaining < i.critical_threshold).map(material => (
                          <div key={material.id} className="bg-rose-50/40 border border-rose-100 p-2 rounded">
                            <div className="flex justify-between text-[11px] font-bold">
                              <span className="text-slate-800 text-xs truncate max-w-[130px] inline-block font-bold">{material.material_name}</span>
                              <span className="text-rose-600 font-extrabold text-xs shrink-0">{material.quantity_remaining.toFixed(0)} {material.unit}</span>
                            </div>
                            <div className="text-[9px] text-slate-500 mt-0.5">Kritinis likutis: {material.critical_threshold} {material.unit}</div>
                            <div className="w-full bg-rose-100 h-1 mt-1.5 rounded-full">
                              <div className="bg-rose-600 h-1 rounded-full" style={{ width: `${Math.min(100, (material.quantity_remaining / (material.critical_threshold * 4)) * 100)}%` }}></div>
                            </div>
                          </div>
                        ))}
                        {inventory.filter(i => i.quantity_remaining < i.critical_threshold).length === 0 && (
                          <div className="text-[11px] text-slate-400 italic text-center py-6">
                            Nėra žemo likučio žaliavų!
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => setActiveTab("inventory")}
                        className="mt-2.5 w-full py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Valdyti visą sandėlį
                      </button>
                    </div>

                    {/* Profit Snapshot */}
                    <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs flex-1 flex flex-col justify-between bg-gradient-to-b from-white to-slate-50/30">
                      <div>
                        <div className="text-[10px] font-black text-slate-600 uppercase mb-2 flex items-center justify-between tracking-wider">
                          <span>Pelno Suvestinė</span>
                          <span className="text-[9px] text-indigo-500 font-mono font-bold px-1 bg-indigo-50 border border-indigo-100 rounded">LIVE DATA</span>
                        </div>
                        <div className="flex flex-col items-center justify-center py-2">
                          <div className="w-24 h-24 rounded-full border-8 border-slate-100 flex items-center justify-center relative shadow-inner">
                            <div className="absolute inset-0 rounded-full border-8 border-indigo-600 border-t-transparent -rotate-45"></div>
                            <div className="text-center">
                              <div className="text-xs font-black text-slate-855 font-mono">
                                {financeSummary ? `${financeSummary.totalNetProfit.toFixed(0)} €` : "0 €"}
                              </div>
                              <div className="text-[8px] text-slate-400">Grynasis</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5 text-[10px] border-t border-slate-100 pt-2 shrink-0">
                        <div className="flex justify-between text-slate-500">
                          <span>Medžiagų kaštai:</span>
                          <span className="font-mono font-bold text-slate-700">{financeSummary ? `${financeSummary.totalMaterialsCost.toFixed(0)} €` : "0 €"}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Apyvarta:</span>
                          <span className="font-mono font-bold text-slate-700">{financeSummary ? `${financeSummary.totalRevenue.toFixed(0)} €` : "0 €"}</span>
                        </div>
                        <div className="flex justify-between text-slate-800 pt-1.5 border-t border-dashed border-slate-200">
                          <span className="font-bold">Grynasis pelnas:</span>
                          <span className="font-extrabold font-mono text-emerald-600">{financeSummary ? `${financeSummary.totalNetProfit.toFixed(1)} €` : "0 €"}</span>
                        </div>
                      </div>
                    </div>

                  </aside>
                </div>
              )}

              {/* TAB 2: SHOPIFY WEBHOOK SIMULATOR */}
              {activeTab === "webhook" && (
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <div className="pb-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Shopify Webhook Integracijos Testeris</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Išbandykite realią Shopify webhook signature HMAC validaciją ir užsakymo įrašymą</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 mt-3 overflow-hidden min-h-0">
                    
                    {/* Form block */}
                    <div className="lg:col-span-5 bg-white p-4 rounded border border-slate-200 flex flex-col justify-between overflow-y-auto max-h-full space-y-3 shadow-xs">
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                          Kurti imituotą užsakymą
                        </h3>

                        <div className="space-y-2.5">
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block uppercase">Pirkėjo vardas, pavardė</label>
                            <input 
                              type="text" 
                              value={webhookCustomerName}
                              onChange={(e) => setWebhookCustomerName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block uppercase">El. paštas (Resend išsiuntimui)</label>
                            <input 
                              type="email" 
                              value={webhookCustomerEmail}
                              onChange={(e) => setWebhookCustomerEmail(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-500 block uppercase">Gaminio pavadinimas</label>
                            <input 
                              type="text" 
                              value={webhookProductTitle}
                              onChange={(e) => setWebhookProductTitle(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-855"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 block uppercase">Prekės SKU</label>
                              <input 
                                type="text" 
                                value={webhookSku}
                                onChange={(e) => setWebhookSku(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 block uppercase">Kiekis (vnt.)</label>
                              <input 
                                type="number" 
                                value={webhookQty}
                                onChange={(e) => setWebhookQty(parseInt(e.target.value) || 1)}
                                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 block uppercase">Vieneto kaina (€)</label>
                              <input 
                                type="text" 
                                value={webhookPrice}
                                onChange={(e) => setWebhookPrice(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-500 block uppercase">Siuntimas (€)</label>
                              <input 
                                type="text" 
                                value={webhookShipping}
                                onChange={(e) => setWebhookShipping(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100 shrink-0">
                        <button
                          onClick={executeShopifyWebhookSimulation}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Siųsti Shopify Webhook
                        </button>

                        <div className="p-2.5 bg-indigo-50/50 rounded border border-indigo-100 text-[10px] text-indigo-900 leading-relaxed space-y-0.5">
                          <p className="font-extrabold text-indigo-950 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-indigo-600" />
                            HMAC SHA-256 Validacija
                          </p>
                          <p>Serveris naudos raktą <code>{WEBHOOK_TEST_SECRET}</code> parašo generavimui ir tikrinimui per <code>X-Shopify-Hmac-SHA256</code>.</p>
                        </div>
                      </div>
                    </div>

                    {/* Logs output blocks */}
                    <div className="lg:col-span-7 bg-[#0f172a] rounded border border-slate-800 p-4 text-slate-200 font-mono text-[11px] flex flex-col justify-between overflow-hidden h-full shadow-xs">
                      <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2 shrink-0">
                        <span className="text-slate-400 font-black uppercase tracking-wider text-[9px] flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-indigo-400" />
                          Webhook Gamybos Terminalas (Real-Time Logs)
                        </span>
                        <button 
                          onClick={() => setWebhookLog([])}
                          className="text-[9px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
                        >
                          Valyti žurnalą
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                        {webhookLog.length === 0 ? (
                          <div className="text-slate-600 italic py-16 text-center text-xs">
                            Laukiama Shopify webhook simuliavimo užklausos...
                            <br />
                            <span className="text-[9px] mt-1 block text-slate-700 font-sans">Užpildykite užsakymo duomenis kairėje ir paspauskite siuntimo mygtuką</span>
                          </div>
                        ) : (
                          webhookLog.map((log, idx) => (
                            <div key={idx} className="border-l border-slate-800 pl-2 py-0.5">
                              <span className="text-slate-500 text-[9px] mr-2 block">{log.time}</span>
                              <span className={`font-black ${
                                log.type === "sent" 
                                  ? "text-blue-400" 
                                  : log.type === "received" 
                                  ? "text-emerald-400" 
                                  : log.type === "hmac" 
                                  ? "text-amber-400" 
                                  : "text-rose-400"
                              }`}>
                                [{log.type.toUpperCase()}]
                              </span>{" "}
                              <span className="text-slate-300 leading-normal text-[10px] block mt-0.5 whitespace-pre-wrap">
                                {log.text}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="border-t border-slate-800/85 pt-2 mt-2 text-[9px] text-slate-500 flex justify-between shrink-0 font-sans">
                        <span>POST /api/webhooks/shopify</span>
                        <span>Crypto SHA-256 Enabled</span>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 3: INVENTORY TRACKING */}
              {activeTab === "inventory" && (
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <div className="pb-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Gamybos žaliavų ir sandėlio apskaita</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Sistema automatiškai patikrina ir nurašo žaliavas nuskenavus QR kodą gamyboje</p>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col md:flex-row gap-4 mt-3 overflow-hidden min-h-0">
                    
                    {/* Left Column: Materials Grid */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {inventory.map(material => {
                          const isCritical = material.quantity_remaining < material.critical_threshold;
                          const percentage = Math.min(100, (material.quantity_remaining / (material.critical_threshold * 4)) * 100);
                          
                          return (
                            <div 
                              key={material.id} 
                              className={`p-3.5 rounded border bg-white shadow-xs space-y-3 transition-all hover:border-slate-300 ${
                                isCritical ? "border-rose-200 bg-rose-50/25" : "border-slate-200"
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="font-bold text-slate-800 text-xs">{material.material_name}</h3>
                                  <p className="text-[9px] font-mono text-slate-400 mt-0.5">SKU: {material.sku} • {material.cost_per_unit.toFixed(2)} € / {material.unit}</p>
                                </div>
                                
                                {isCritical ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-rose-105 bg-rose-50 text-rose-800 text-[9px] font-black rounded border border-rose-200 animate-pulse">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Žemas likutis
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-emerald-50 text-emerald-800 text-[9px] font-black rounded border border-emerald-200">
                                    <CheckCircle className="w-2.5 h-2.5" />
                                    Pakankamai
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] font-semibold">
                                  <span className="text-slate-500">Likutis sandėlyje:</span>
                                  <span className={`text-[11px] ${isCritical ? "text-rose-600 font-extrabold" : "text-slate-800 font-bold"}`}>
                                    {material.quantity_remaining.toFixed(1)} {material.unit}
                                  </span>
                                </div>
                                
                                {/* Stock Indicator Progress bar */}
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      isCritical ? "bg-rose-500" : "bg-indigo-600"
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                                <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                                  <span>0 {material.unit}</span>
                                  <span>Kritinė riba: {material.critical_threshold} {material.unit}</span>
                                </div>
                              </div>

                              {/* REPLENISH ACTIONS */}
                              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                                <input 
                                  type="number" 
                                  placeholder={`Kiekis (${material.unit})`}
                                  value={replenishQty[material.id] || ""}
                                  onChange={(e) => setReplenishQty(prev => ({ ...prev, [material.id]: e.target.value }))}
                                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 w-24 text-slate-800"
                                />
                                <button
                                  onClick={() => replenishMaterial(material.id, material.material_name)}
                                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-[9px] py-1 px-2.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  Papildyti
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right Column: Inventory Creation Form & Audit Log */}
                    <div className="w-full md:w-80 space-y-4 shrink-0 flex flex-col h-full overflow-hidden">
                      {/* Section 1: Add New Material */}
                      <div className="bg-white rounded border border-slate-200 p-4 space-y-3 shrink-0">
                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5 text-indigo-600" />
                          Pridėti naują žaliavą
                        </h3>
                        <form onSubmit={handleAddInventoryItem} className="space-y-2.5">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Pavadinimas</label>
                            <input
                              type="text"
                              placeholder="pvz., Difuzoriaus stiklas"
                              value={newInvName}
                              onChange={(e) => setNewInvName(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">SKU kodas (receptams)</label>
                            <input
                              type="text"
                              placeholder="pvz., DIFFUSER-GLASS"
                              value={newInvSku}
                              onChange={(e) => setNewInvSku(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Likutis</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="100.00"
                                value={newInvQty}
                                onChange={(e) => setNewInvQty(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Mato vnt.</label>
                              <select
                                value={newInvUnit}
                                onChange={(e) => setNewInvUnit(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                              >
                                <option value="pcs">vnt (pcs)</option>
                                <option value="m2">m² (kv. m)</option>
                                <option value="ml">ml (mililitrai)</option>
                                <option value="kg">kg (kilogramai)</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Kritinė riba</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="10.00"
                                value={newInvThreshold}
                                onChange={(e) => setNewInvThreshold(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Savikaina (€/vnt)</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="1.00"
                                value={newInvCost}
                                onChange={(e) => setNewInvCost(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                          <button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2 rounded cursor-pointer transition-all shadow-sm"
                          >
                            Sukurti žaliavą
                          </button>
                        </form>
                      </div>

                      {/* Section 2: Audit trail log */}
                      <div className="bg-white rounded border border-slate-200 p-4 flex flex-col flex-1 shadow-xs overflow-hidden">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 shrink-0">
                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                          Žaliavų nurašymo žurnalas
                        </h3>
                        <p className="text-[10px] text-slate-500 mb-2 leading-relaxed shrink-0">Automatiškai generuojami įrašai iš gamybos salės QR skenerių:</p>
                        
                        <div className="flex-1 overflow-y-auto space-y-1.5 bg-slate-50/50 p-2 rounded border border-slate-150 font-mono text-[10px]">
                          {orders.filter(o => o.status === "PRINTED_AND_PACKED" || o.status === "FULFILLED").map((order, idx) => (
                            <div key={idx} className="p-1.5 bg-white border border-slate-100 rounded hover:shadow-2xs transition-shadow">
                              <span className="font-bold text-slate-700 block text-[9px]">Užsakymas {order.order_number}:</span>
                              <span className="font-medium text-rose-600 block mt-0.5">
                                Atliktas nurašymas pagal prekės receptą
                              </span>
                            </div>
                          ))}
                          {orders.filter(o => o.status === "PRINTED_AND_PACKED" || o.status === "FULFILLED").length === 0 && (
                            <div className="py-12 text-center italic text-slate-400">
                              Nėra nurašymo įrašų. Atlikite gamybos pabaigos veiksmus.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 4: PROFITABILITY & FINANCIAL ERP */}
              {activeTab === "finance" && (
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <div className="pb-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Pelningumo variklis & Finansų analitika</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Sąnaudų apskaita: grynojo pelno, PVM mokesčių ir žaliavų savikainos skaičiavimai buhalterijai</p>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-4 mt-3 overflow-y-auto pr-1 min-h-0">
                    {/* FINANCIAL CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
                      <div className="bg-[#0f172a] text-white p-4 rounded border border-slate-850 flex flex-col justify-between shadow-xs">
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Bendra apyvarta (Revenue)</span>
                        <p className="text-2xl font-black tracking-tight text-white mt-1.5 font-mono">
                          {financeSummary ? `${financeSummary.totalRevenue.toFixed(2)} €` : "0.00 €"}
                        </p>
                        <p className="text-[9px] text-slate-500 mt-2 font-sans">Suformuota iš visų Shopify webhook pirkimų</p>
                      </div>

                      <div className="bg-white border border-slate-200 p-4 rounded flex flex-col justify-between shadow-xs">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">Gamybinės sąnaudos (COGS)</span>
                        <p className="text-2xl font-black tracking-tight text-slate-800 mt-1.5 font-mono">
                          {financeSummary ? `${financeSummary.totalMaterialsCost.toFixed(2)} €` : "0.00 €"}
                        </p>
                        <p className="text-[9px] text-slate-400 mt-2">Žaliavos + dažai + pakuotės</p>
                      </div>

                      <div className="bg-emerald-50 text-emerald-950 border border-emerald-200 p-4 rounded flex flex-col justify-between shadow-xs">
                        <span className="text-[9px] text-emerald-800 font-black uppercase tracking-wider block">Grynasis pelnas (Net Profit)</span>
                        <p className="text-2xl font-black tracking-tight text-emerald-700 mt-1.5 font-mono">
                          {financeSummary ? `${financeSummary.totalNetProfit.toFixed(2)} €` : "0.00 €"}
                        </p>
                        <div className="flex justify-between items-center text-[9px] mt-2 border-t border-emerald-150 pt-1.5 font-sans">
                          <span className="text-emerald-800 font-medium">Vidutinė pelno marža:</span>
                          <span className="font-extrabold text-emerald-900 bg-emerald-150 px-1.5 py-0.2 rounded font-mono">{financeSummary ? `${financeSummary.profitMarginPercent}%` : "0%"}</span>
                        </div>
                      </div>
                    </div>

                    {/* SQL TRIGGER VIEW */}
                    <div className="bg-white border border-slate-200 rounded p-4 flex flex-col shrink-0 space-y-3 shadow-xs">
                      <div className="flex justify-between items-center shrink-0">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-indigo-500" />
                          Buhalterinė SQL Suvestinė (monthly_financial_summary View)
                        </h3>
                        <button
                          onClick={() => {
                            setGlobalNotify({ type: "success", message: "CSV ataskaita buhalterijai sėkmingai suformuota!" });
                            setTimeout(() => setGlobalNotify(null), 3000);
                          }}
                          className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-[9px] py-1 px-2.5 rounded transition-all cursor-pointer border border-slate-250 flex items-center gap-1 shadow-2xs"
                        >
                          <Download className="w-3 h-3" />
                          Atsisiųsti CSV
                        </button>
                      </div>

                      <div className="bg-[#0f172a] rounded p-3 border border-slate-800 text-slate-300 font-mono text-[10px] space-y-2">
                        <div className="text-indigo-400 font-semibold border-b border-slate-800/85 pb-1.5">
                          SELECT * FROM monthly_financial_summary;
                        </div>

                        {/* SQL VIEW SIMULATED OUTPUT */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[10px] text-slate-300 divide-y divide-slate-850">
                            <thead>
                              <tr className="text-slate-500 font-black uppercase tracking-wider text-[8px]">
                                <th className="pb-1.5">Periodas</th>
                                <th className="pb-1.5 text-right">Užsakymai</th>
                                <th className="pb-1.5 text-right">Apyvarta</th>
                                <th className="pb-1.5 text-right">Žaliavos</th>
                                <th className="pb-1.5 text-right">Siuntimas</th>
                                <th className="pb-1.5 text-right">Pelnas</th>
                                <th className="pb-1.5 text-right">Sąskaitos</th>
                                <th className="pb-1.5 text-right">Marža (%)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850">
                              <tr className="hover:bg-slate-850/35 transition-colors">
                                <td className="py-2 text-indigo-400 font-bold">2026-06</td>
                                <td className="py-2 text-right text-slate-400">{financeSummary?.totalOrders}</td>
                                <td className="py-2 text-right text-slate-400">{financeSummary?.totalRevenue.toFixed(2)} €</td>
                                <td className="py-2 text-right text-slate-400">{financeSummary?.totalMaterialsCost.toFixed(2)} €</td>
                                <td className="py-2 text-right text-slate-400">{(financeSummary?.totalShippingRevenue || 0).toFixed(2)} €</td>
                                <td className="py-2 text-right font-black text-emerald-400">{financeSummary?.totalNetProfit.toFixed(2)} €</td>
                                <td className="py-2 text-right text-slate-400">{financeSummary?.totalInvoicesIssued}</td>
                                <td className="py-2 text-right text-emerald-400 font-black">{financeSummary?.profitMarginPercent}%</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: RESEND EMAIL JOURNAL */}
              {activeTab === "emails" && (
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <div className="pb-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Resend / Nodemailer El. laiškų Žurnalas</h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Stebėkite automatinių PVM sąskaitų-faktūrų išsiuntimą klientams realiu laiku</p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 pr-1 min-h-0">
                    {emailLogs.length === 0 ? (
                      <div className="py-16 text-center text-slate-400 italic border border-dashed border-slate-200 bg-white rounded">
                        <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-xs text-slate-600">Nėra išsiųstų el. laiškų įrašų</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Sukurkite arba pažymėkite sąskaitą faktūrą gamybos eilėje</p>
                      </div>
                    ) : (
                      emailLogs.map(log => (
                        <div key={log.id} className="bg-white rounded border border-slate-200 p-3.5 space-y-2.5 hover:border-slate-300 transition-all shadow-2xs">
                          <div className="flex justify-between items-center flex-wrap gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-purple-50 text-purple-800 text-[8px] font-black px-1.5 py-0.2 rounded uppercase border border-purple-150">
                                Resend API
                              </span>
                              <span className="font-mono text-[10px] font-bold text-slate-700">Gavėjas: {log.recipient}</span>
                            </div>
                            <span className="text-[9px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded border border-slate-150 text-[11px] leading-relaxed">
                            <p className="font-black text-slate-800 mb-0.5">Tema: {log.subject}</p>
                            <p className="text-slate-500 italic">
                              "{log.bodyPreview}"
                            </p>
                            <div className="mt-2 pt-1.5 border-t border-slate-150/75 flex items-center justify-between text-[8px]">
                              <span className="text-emerald-700 font-black flex items-center gap-1 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-150">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                DELIVERED (Sėkmingai)
                              </span>
                              <span className="text-slate-400 font-mono">Attachment: invoice_pdf</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>

      {/* QR SCAN SIMULATION MODAL */}
      {qrModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-600 animate-pulse" />
                Gamybos QR Skenavimas (Simuliacija)
              </h3>
              <button 
                onClick={() => setQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-semibold cursor-pointer text-sm"
              >
                Uždaryti
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Darbuotojas spaudos salėje nuskenuoja gaminio lipduko brūkšninį arba QR kodą. Pasirinkite užsakymą žemiau gamybos patvirtinimui ir žaliavų išsandėliavimui:
            </p>

            <div className="space-y-2">
              {orders.filter(o => o.status === "READY_FOR_PRODUCTION").map(order => (
                <button
                  key={order.id}
                  onClick={() => scanQrCode(order.id)}
                  className="w-full text-left bg-slate-50 hover:bg-slate-100 p-3 rounded-xl border border-slate-200 flex justify-between items-center transition-all group cursor-pointer"
                >
                  <div>
                    <span className="font-mono font-bold text-slate-800 block text-xs">{order.order_number}</span>
                    <span className="text-[10px] text-slate-500">Klientas: {order.customer_name}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                </button>
              ))}

              {orders.filter(o => o.status === "READY_FOR_PRODUCTION").length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-slate-200">
                  Nėra užsakymų su statusu "Paruošta spaudai". Pirmiausia sugeneruokite spaudos failą kuriam nors užsakymui!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODULE 4.5: SAAS CONFIGURATION TAB */}
      {activeTab === "config" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 min-h-screen text-slate-800">
          <div className="flex justify-between items-center border-b border-slate-200 pb-5">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">SaaS & Stotelių valdymas</h2>
              <p className="text-xs text-slate-500 mt-1">Konfigūruokite gamybos stoteles ir automatines užsakymų nukreipimo taisykles pagal prekių SKU.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Stations list & creation form */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nauja Gamybos Stotelė</h3>
                <form onSubmit={handleAddStation} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Stotelės pavadinimas</label>
                    <input
                      type="text"
                      placeholder="pvz., Drobių stotelė"
                      value={newStationName}
                      onChange={(e) => setNewStationName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Kodas (unikali žymė)</label>
                    <input
                      type="text"
                      placeholder="pvz., CANVAS"
                      value={newStationCode}
                      onChange={(e) => setNewStationCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Aprašymas</label>
                    <textarea
                      placeholder="Stotelės paskirties ar įrenginių aprašymas..."
                      value={newStationDesc}
                      onChange={(e) => setNewStationDesc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 h-20 resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded transition-all cursor-pointer"
                  >
                    Sukurti stotelę
                  </button>
                </form>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Aktyvios Gamybos Stotelės</h3>
                <div className="divide-y divide-slate-100">
                  {stationsList.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">Nėra sukurtų stotelių.</p>
                  ) : (
                    stationsList.map((s) => (
                      <div key={s.id} className="py-3 border-b border-slate-100 last:border-0">
                        <div 
                          className="flex justify-between items-start cursor-pointer hover:bg-slate-50/50 p-1.5 rounded transition-colors" 
                          onClick={() => handleToggleStationExpand(s.id)}
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{s.name}</span>
                              <span className="bg-slate-100 text-slate-700 font-mono text-[9px] px-1 py-0.2 rounded">{s.code}</span>
                              <span className="text-[9px] text-slate-400 font-bold ml-1.5">
                                {expandedStationId === s.id ? "▲ Suskleisti" : "▼ Valdyti stalus"}
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">{s.description || "Nėra aprašymo."}</p>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">ID: {s.id.substring(0, 8)}</span>
                        </div>

                        {expandedStationId === s.id && (
                          <div className="mt-3 pl-4 border-l-2 border-indigo-500 space-y-4">
                            {/* List of current beds */}
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sukonfigūruoti stalo dydžiai:</p>
                              {expandedBedsList.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic">Ši stotelė neturi sukonfigūruotų stalų dydžių.</p>
                              ) : (
                                expandedBedsList.map((bed) => (
                                  <div key={bed.id} className="flex justify-between items-center text-[10px] bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="font-semibold text-slate-700">{bed.name} ({bed.width_mm} × {bed.height_mm} mm)</span>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm(`Ar tikrai norite pašalinti stalą '${bed.name}'?`)) {
                                          try {
                                            await fetch(`/api/beds/${bed.id}`, { method: "DELETE" });
                                            showNotification("success", `Stalas pašalintas.`);
                                            // Refetch beds
                                            const resB = await fetch(`/api/stations/${s.id}/beds`);
                                            const dataB = await resB.json();
                                            setExpandedBedsList(dataB);
                                          } catch (err) {
                                            showNotification("error", "Nepavyko pašalinti stalo.");
                                          }
                                        }
                                      }}
                                      className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                                    >
                                      Pašalinti
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Add bed form */}
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!newBedName || !newBedWidth || !newBedHeight) return;
                                try {
                                  const res = await fetch(`/api/stations/${s.id}/beds`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      name: newBedName,
                                      width_mm: newBedWidth,
                                      height_mm: newBedHeight
                                    })
                                  });
                                  const data = await res.json();
                                  if (data.id) {
                                    showNotification("success", `Stalas '${newBedName}' pridėtas.`);
                                    setNewBedName("");
                                    // Refetch beds
                                    const resB = await fetch(`/api/stations/${s.id}/beds`);
                                    const dataB = await resB.json();
                                    setExpandedBedsList(dataB);
                                  }
                                } catch (err) {
                                  showNotification("error", "Nepavyko pridėti stalo.");
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 space-y-2"
                            >
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Pridėti naują stalo dydį:</p>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="Pavadinimas (pvz., Mini FlatBed)"
                                  value={newBedName}
                                  onChange={(e) => setNewBedName(e.target.value)}
                                  className="col-span-2 bg-white border border-slate-200 rounded px-2.5 py-1 text-[10px] text-slate-800"
                                />
                                <input
                                  type="number"
                                  placeholder="Plotis (mm)"
                                  value={newBedWidth}
                                  onChange={(e) => setNewBedWidth(e.target.value)}
                                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-[10px] text-slate-800"
                                />
                                <input
                                  type="number"
                                  placeholder="Aukštis (mm)"
                                  value={newBedHeight}
                                  onChange={(e) => setNewBedHeight(e.target.value)}
                                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-[10px] text-slate-800"
                                />
                              </div>
                              <button
                                type="submit"
                                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[9px] py-1 rounded cursor-pointer"
                              >
                                Pridėti stalą
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right: Product configs list & creation form */}
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nauja maršrutizavimo taisyklė</h3>
                <form onSubmit={handleAddConfig} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Taisyklės pavadinimas</label>
                    <input
                      type="text"
                      placeholder="pvz., Standartiniai plakatai"
                      value={newConfigName}
                      onChange={(e) => setNewConfigName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">SKU šablonas (wildcard `*` palaikymas)</label>
                    <input
                      type="text"
                      placeholder="pvz., POSTER-*"
                      value={newConfigSku}
                      onChange={(e) => setNewConfigSku(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Priskirta gamybos stotelė</label>
                    <select
                      value={newConfigStationId}
                      onChange={(e) => setNewConfigStationId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    >
                      <option value="">Pasirinkite stotelę...</option>
                      {stationsList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Spaudos failų generavimo tipas</label>
                    <select
                      value={newConfigArtType}
                      onChange={(e) => setNewConfigArtType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    >
                      <option value="standard_canvas">Standard Canvas (Foto drobės maketas)</option>
                      <option value="high_res_poster">High-Res Poster (Satininis plakatas)</option>
                      <option value="custom_sticker">Custom Sticker (Pjaustomi lipdukai)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Reikalaujama žaliava (Receptūra)</label>
                    <select
                      value={newConfigMatSku}
                      onChange={(e) => setNewConfigMatSku(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    >
                      <option value="">Pasirinkite žaliavą (neprivaloma)...</option>
                      {inventory.map((mat) => (
                        <option key={mat.id} value={mat.sku}>{mat.material_name} ({mat.sku})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Reikalingas žaliavos kiekis prekei</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="pvz., 1.00"
                      value={newConfigMatQty}
                      onChange={(e) => setNewConfigMatQty(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded transition-all cursor-pointer"
                  >
                    Sukurti taisyklę
                  </button>
                </form>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Aktyvios nukreipimo taisyklės</h3>
                <div className="divide-y divide-slate-100">
                  {productConfigs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">Nėra sukurtų taisyklių.</p>
                  ) : (
                    productConfigs.map((c) => (
                      <div key={c.id} className="py-3 flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{c.name} <span className="bg-indigo-50 text-indigo-700 font-mono text-[9px] px-1 py-0.2 rounded ml-1.5">{c.sku_pattern}</span></p>
                          <p className="text-[10px] text-slate-500 mt-1">Stotelė: <span className="font-semibold text-slate-700">{c.stations?.name || "Nepriskirta"}</span> | Generavimas: <span className="font-mono">{c.artwork_generator_type}</span>{c.required_material_sku && <span className="ml-1.5 text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Receptas: {c.required_material_sku} ({c.material_qty_per_item} vnt)</span>}</p>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">ID: {c.id.substring(0, 8)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOR COURIER LABEL */}
      {activeLabelUrl && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                <Truck className="w-5 h-5 text-indigo-600" />
                Kurjerio DPD / DHL Siuntos Lipdukas
              </h3>
              <button 
                onClick={() => setActiveLabelUrl(null)}
                className="text-slate-400 hover:text-slate-600 font-semibold cursor-pointer text-sm"
              >
                Uždaryti
              </button>
            </div>

            {/* High-fidelity visual simulated label */}
            <div className="bg-white border-2 border-slate-950 rounded-lg p-5 font-mono text-xs text-slate-950 space-y-4 shadow-sm">
              <div className="flex justify-between items-start border-b border-slate-900 pb-3">
                <div>
                  <p className="font-black text-lg">DPD COURIER</p>
                  <p className="text-[9px]">Lithuania Express Priority</p>
                </div>
                <p className="font-black text-xs text-right border border-slate-900 p-1">1/1</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[9px] leading-relaxed border-b border-slate-900 pb-3">
                <div>
                  <p className="font-bold uppercase text-slate-500 text-[8px]">From / Siuntėjas:</p>
                  <p className="font-bold">UAB Printflow ERP</p>
                  <p>Gamyklos g. 12</p>
                  <p>Vilnius, LT-02948</p>
                </div>
                <div>
                  <p className="font-bold uppercase text-slate-500 text-[8px]">To / Gavėjas:</p>
                  <p className="font-bold">Atrinktas pirkėjas</p>
                  <p>Konstitucijos pr. 21</p>
                  <p>Vilnius, Lietuva</p>
                </div>
              </div>

              <div className="space-y-2 py-2 text-center">
                <p className="font-bold text-xs uppercase tracking-widest text-slate-500">Barcode / Sekimo numeris</p>
                <div className="h-10 bg-slate-900 w-full flex items-center justify-center text-white font-bold text-xs">
                  ||||| | ||||| | ||| |||| || ||| | |||
                </div>
                <p className="font-mono text-xs font-bold tracking-wider">DPD-LT-48291039281</p>
              </div>
            </div>

            <button 
              onClick={() => {
                alert("Siuntos lipdukas išsiųstas į gamyklos Zebra etikečių spausdintuvą!");
                setActiveLabelUrl(null);
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-4 rounded-lg transition-colors cursor-pointer"
            >
              Spausdinti lipduką (Zebra Thermal)
            </button>
          </div>
        </div>
      )}

      {/* MODAL FOR INVOICE PREVIEW */}
      {activeInvoiceText && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
                <FileText className="w-5 h-5 text-indigo-600" />
                Sugeneruota PVM Sąskaita-Faktūra (Supabase Storage failas)
              </h3>
              <button 
                onClick={() => setActiveInvoiceText(null)}
                className="text-slate-400 hover:text-slate-600 font-semibold cursor-pointer text-sm"
              >
                Uždaryti
              </button>
            </div>

            <pre className="bg-slate-50 p-4 rounded-lg border border-slate-200 font-mono text-[10px] text-slate-800 leading-relaxed overflow-x-auto whitespace-pre">
              {activeInvoiceText}
            </pre>

            <button 
              onClick={() => {
                alert("PVM Sąskaita sėkmingai atsiųsta į jūsų įrenginį.");
                setActiveInvoiceText(null);
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Atsisiųsti PDF dokumentą
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
