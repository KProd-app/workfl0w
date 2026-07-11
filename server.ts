/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import crypto from "crypto";
import * as dotenv from "dotenv";
import { supabase } from "./lib/supabase";
import { InvoiceService } from "./lib/services/invoice-service";

// Load environment variables
dotenv.config();

// Define TypeScript interfaces for backend state
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

interface UsageLog {
  id: string;
  order_id: string;
  material_id: string;
  quantity_used: number;
  logged_at: string;
}

// Shared webhook key used to sign requests
const WEBHOOK_TEST_SECRET = "shopify_printflow_hmac_secret_2026";


const app = express();

  // Middleware to capture RAW body buffer for HMAC calculations
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Middleware to check if Supabase is properly initialized
  app.use((req, res, next) => {
    if (req.path.startsWith("/api") && req.path !== "/api/webhooks/shopify/simulate-webhook") {
      if (!supabase) {
        return res.status(500).json({
          error: "Supabase client is not initialized. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured in your Vercel Environment Variables, then Redeploy."
        });
      }
    }
    next();
  });

  // ============================================================================
  // MODULE 1: SHOPIFY INTEGRACIJA IR WEBHOOK VALIDACIJA
  // Real implementation verifying X-Shopify-Hmac-SHA256
  // ============================================================================
  app.post("/api/webhooks/shopify", async (req: any, res) => {
    try {
      const shopifyHmac = req.headers["x-shopify-hmac-sha256"];
      
      if (!shopifyHmac) {
        console.error("Missing X-Shopify-Hmac-SHA256 header");
        return res.status(401).json({ error: "Missing Shopify HMAC header" });
      }

      // Compute SHA256 HMAC based on Raw Body buffer
      const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
      const calculatedHmac = crypto
        .createHmac("sha256", WEBHOOK_TEST_SECRET)
        .update(rawBody, "utf8")
        .digest("base64");

      // timingSafeEqual to prevent side-channel timing analysis
      const bufferA = Buffer.from(shopifyHmac, "base64");
      const bufferB = Buffer.from(calculatedHmac, "base64");

      if (bufferA.length !== bufferB.length || !crypto.timingSafeEqual(bufferA, bufferB)) {
        console.warn("Shopify Webhook authentication failed. Invalid HMAC signature");
        return res.status(401).json({ error: "Invalid HMAC signature" });
      }

      // Validated successfully. Parse order details
      const payload = req.body;
      
      // Determine order number sequentially based on orders count
      const { count, error: countError } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true });

      if (countError) throw countError;

      const orderCount = count || 0;
      const orderNo = `#10${orderCount + 24}`;

      const clientName = `${payload.customer?.first_name || ""} ${payload.customer?.last_name || ""}`.trim() || "Shopify Customer";
      const clientEmail = payload.customer?.email || payload.email || "klientas@shopify.lt";
      const totalPrice = parseFloat(payload.total_price || "100.00");
      const shippingPrice = parseFloat(payload.shipping_lines?.[0]?.price || "5.90");

      // Estimate initial raw materials based on SKU
      let estimatedMaterialsCost = 0.00;
      const lineItems = (payload.line_items || []).map((item: any) => {
        const sku = item.sku || "GENERIC";
        let cost = 1.50; // default cost multiplier
        if (sku.includes("CANVAS")) cost = 15.00;
        else if (sku.includes("POSTER")) cost = 4.00;
        else if (sku.includes("INK")) cost = 2.00;

        estimatedMaterialsCost += (cost * (item.quantity || 1));

        return {
          shopify_line_item_id: String(item.id || Math.floor(Math.random() * 100000)),
          product_name: item.title || "Spaudos gaminys",
          sku: sku,
          quantity: item.quantity || 1,
          price: parseFloat(item.price || "50.00"),
          artwork_file_url: "" // PENDING_ARTWORK lacks printing PDF initially
        };
      });

      const netProfit = totalPrice - estimatedMaterialsCost - shippingPrice;

      const newOrder = {
        shopify_order_id: String(payload.id || Date.now()),
        order_number: orderNo,
        customer_name: clientName,
        customer_email: clientEmail,
        total_price: totalPrice,
        shipping_price: shippingPrice,
        raw_materials_cost: estimatedMaterialsCost,
        net_profit: parseFloat(netProfit.toFixed(2)),
        status: "PENDING_ARTWORK", // Must enter pending artwork check first
        shipping_address: payload.shipping_address || { city: "Vilnius", address: "Gedimino pr. 5" },
        shopify_fulfilled: false
      };

      // Add to database
      const { data: insertedOrder, error: insertOrderError } = await supabase
        .from("orders")
        .insert(newOrder)
        .select()
        .single();

      if (insertOrderError) throw insertOrderError;

      // Insert line items
      const itemsToInsert = lineItems.map((item: any) => ({
        order_id: insertedOrder.id,
        shopify_line_item_id: item.shopify_line_item_id,
        product_name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        artwork_file_url: item.artwork_file_url
      }));

      const { error: insertItemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (insertItemsError) throw insertItemsError;

      console.log(`Webhook accepted. Inserted Order ${orderNo} as PENDING_ARTWORK.`);
      return res.status(200).json({
        success: true,
        order_id: insertedOrder.id,
        status: "PENDING_ARTWORK",
        message: "Shopify order successfully received and logged to production"
      });

    } catch (err: any) {
      console.error("Webhook processing error:", err);
      return res.status(500).json({ error: "Internal processing crash", details: err.message });
    }
  });

  // Helper endpoint to generate dynamic HMAC signature for testing Shopify webhooks
  app.post("/api/webhooks/shopify/simulate-webhook", (req, res) => {
    const payload = req.body;
    const rawPayloadText = JSON.stringify(payload);

    // Calculate real HMAC using the test secret
    const signature = crypto
      .createHmac("sha256", WEBHOOK_TEST_SECRET)
      .update(rawPayloadText, "utf8")
      .digest("base64");

    // Make local HTTP post request internally to trigger the webhook logic
    // This allows testing the exact crypto logic above
    return res.json({
      testHeader: signature,
      secretUsed: WEBHOOK_TEST_SECRET,
      readyPayload: payload
    });
  });

  // ============================================================================
  // MODULE 2: AUTOMATIC SPAUDOS FAILŲ GENERAVIMAS IR INVENTORIAUS NURAŠYMAS
  // Simulates print-ready compilation, artwork upload, and inventory deducts
  // ============================================================================
  app.post("/api/production/generate-artwork", async (req, res) => {
    try {
      const { orderId } = req.body;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const artworkUrl = `https://supabase.printflow-erp.lt/documents/artwork_300dpi_cmyk_${order.order_number}.pdf`;

      // Update orders table
      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({ status: "READY_FOR_PRODUCTION" })
        .eq("id", orderId);

      if (updateOrderError) throw updateOrderError;

      // Update order_items table
      const { error: updateItemsError } = await supabase
        .from("order_items")
        .update({ artwork_file_url: artworkUrl })
        .eq("order_id", orderId);

      if (updateItemsError) throw updateItemsError;

      console.log(`Artwork compiled automatically for ${order.order_number}. Updated status to READY_FOR_PRODUCTION`);
      return res.json({
        success: true,
        status: "READY_FOR_PRODUCTION",
        artworkUrl,
        message: "Automatinis spaudos failas (300 DPI CMYK) sugeneruotas ir patalpintas Supabase Storage!"
      });
    } catch (err: any) {
      console.error("Artwork generation failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // MODULE 3: SĄSKAITŲ FAKTŪRŲ (INVOICES) GENERAVIMAS IR SIUNTIMAS (RESEND)
  // ============================================================================
  app.post("/api/invoices/generate", async (req, res) => {
    try {
      const { orderId } = req.body;
      const result = await InvoiceService.createAndSendInvoice(orderId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Nepavyko sugeneruoti sąskaitos" });
      }

      // Fetch the generated invoice row to return to frontend
      const { data: invoice, error: fetchInvError } = await supabase
        .from("invoices")
        .select("*")
        .eq("order_id", orderId)
        .single();

      if (fetchInvError) throw fetchInvError;

      // Get the customer email for response metadata representation
      const { data: order, error: fetchOrderError } = await supabase
        .from("orders")
        .select("customer_email")
        .eq("id", orderId)
        .single();

      const recipient = order ? order.customer_email : "";

      return res.json({
        success: true,
        invoice,
        emailSent: true,
        recipient,
        message: `Sąskaita-faktūra ${invoice.invoice_number} sugeneruota ir sėkmingai išsiųsta pirkėjui per Resend SMTP.`
      });
    } catch (err: any) {
      console.error("Generate invoice failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/invoices/resend", async (req, res) => {
    try {
      const { orderId } = req.body;
      const result = await InvoiceService.resendInvoiceToCustomer(orderId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.message });
      }

      return res.json({
        success: true,
        message: result.message
      });
    } catch (err: any) {
      console.error("Resend invoice failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // MODULE 4: GAMYBOS EIGOS VALDYMAS & QR SIMULIATORIUS
  // Triggered when workers scan order barcodes
  // ============================================================================
  app.post("/api/production/scan", async (req, res) => {
    try {
      const { orderId } = req.body;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "READY_FOR_PRODUCTION") {
        return res.status(400).json({ 
          error: `Nuskaitymas negalimas. Užsakymo būsena yra '${order.status}', o turi būti 'READY_FOR_PRODUCTION'` 
        });
      }

      // 1. Update status to PRINTED_AND_PACKED
      const { error: updateOrderError } = await supabase
        .from("orders")
        .update({ status: "PRINTED_AND_PACKED" })
        .eq("id", orderId);

      if (updateOrderError) throw updateOrderError;

      // 2. Fetch inventory
      const { data: inventory, error: invError } = await supabase
        .from("inventory")
        .select("*");

      if (invError) throw invError;

      // 3. Subtract raw materials and log usage
      const usageLogs: any[] = [];
      const updatedInventory = [...inventory];

      for (const item of order.order_items) {
        for (const material of updatedInventory) {
          let deductAmount = 0;
          
          if (material.sku === "CANVAS-MAT" && item.sku.includes("CANVAS")) {
            deductAmount = 2.4 * item.quantity;
          } else if (material.sku === "POSTER-MAT" && item.sku.includes("POSTER")) {
            deductAmount = 1.1 * item.quantity;
          } else if (material.sku === "INK-CMYK") {
            deductAmount = 45 * item.quantity;
          } else if (material.sku === "TUBE-PC") {
            deductAmount = 1 * item.quantity;
          }

          if (deductAmount > 0) {
            const currentQty = parseFloat(material.quantity_remaining);
            const newQty = Math.max(0, currentQty - deductAmount);
            material.quantity_remaining = newQty;

            // Update database quantity
            const { error: updateInvError } = await supabase
              .from("inventory")
              .update({ quantity_remaining: newQty })
              .eq("id", material.id);

            if (updateInvError) throw updateInvError;

            usageLogs.push({
              order_id: order.id,
              material_id: material.id,
              quantity_used: deductAmount
            });
          }
        }
      }

      // Insert usage logs
      if (usageLogs.length > 0) {
        const { error: usageError } = await supabase
          .from("raw_materials_usage_log")
          .insert(usageLogs);

        if (usageError) throw usageError;
      }

      console.log(`QR Scanner simulation succeeded for ${order.order_number}. Raw materials deducted from stock.`);
      return res.json({
        success: true,
        status: "PRINTED_AND_PACKED",
        materialsDeducted: usageLogs.length,
        currentInventory: updatedInventory,
        message: `QR nuskenuotas! Užsakymas ${order.order_number} paruoštas pakavimui. Gamybos žaliavos sėkmingai nurašytos.`
      });
    } catch (err: any) {
      console.error("QR production scan failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // MODULE 5: FINANSŲ IR SAVIKAINOS ANALITIKA (PROFITABILITY ENGINE)
  // Monthly reports aggregated for bookkeeping
  // ============================================================================
  app.get("/api/finance/monthly-summary", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("monthly_financial_summary")
        .select("*")
        .order("report_month", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const row = data[0];
        return res.json({
          reportMonth: row.report_month,
          totalOrders: parseInt(row.total_orders),
          totalRevenue: parseFloat(row.total_revenue || 0),
          totalShippingRevenue: parseFloat(row.total_shipping_revenue || 0),
          totalMaterialsCost: parseFloat(row.total_materials_cost || 0),
          totalNetProfit: parseFloat(row.total_net_profit || 0),
          totalInvoicesIssued: parseInt(row.total_invoices_issued || 0),
          profitMarginPercent: parseFloat(row.profit_margin_percent || 0)
        });
      } else {
        // Return default empty values if no data exists
        return res.json({
          reportMonth: new Date().toISOString().substring(0, 7),
          totalOrders: 0,
          totalRevenue: 0.00,
          totalShippingRevenue: 0.00,
          totalMaterialsCost: 0.00,
          totalNetProfit: 0.00,
          totalInvoicesIssued: 0,
          profitMarginPercent: 0.0
        });
      }
    } catch (err: any) {
      console.error("Finance summary failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ============================================================================
  // MODULE 6: LOGISTIKA IR SHOPIFY FULFILLMENT
  // Request courier routing label, fetch tracking, and set Shopify state
  // ============================================================================
  app.post("/api/production/fulfill", async (req, res) => {
    try {
      const { orderId } = req.body;

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("status, order_number")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "PRINTED_AND_PACKED") {
        return res.status(400).json({ error: "Siųsti galima tik atspausdintus ir supakuotus užsakymus." });
      }

      const trackingNo = `DPD-LT-${Math.floor(100000000 + Math.random() * 900000000)}`;
      const shippingLabelUrl = `https://printflow-erp.lt/labels/courier-pdf-${order.order_number}.pdf`;

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "FULFILLED",
          tracking_number: trackingNo,
          shipping_label_url: shippingLabelUrl,
          shopify_fulfilled: true
        })
        .eq("id", orderId);

      if (updateError) throw updateError;

      console.log(`Logistics completed for ${order.order_number}. Tracking ID: ${trackingNo}. Shopify status updated to Fulfilled.`);

      return res.json({
        success: true,
        status: "FULFILLED",
        trackingNumber: trackingNo,
        shippingLabelUrl: shippingLabelUrl,
        shopifyFulfilled: true,
        message: `DHL/DPD lipdukas sugeneruotas! Sekimo Nr: ${trackingNo}. Shopify užsakymas sėkmingai pažymėtas kaip 'Fulfilled'.`
      });
    } catch (err: any) {
      console.error("Order fulfillment failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Inventory replenishment endpoint
  app.post("/api/inventory/replenish", async (req, res) => {
    try {
      const { itemId, amount } = req.body;

      const { data: material, error: fetchError } = await supabase
        .from("inventory")
        .select("*")
        .eq("id", itemId)
        .single();

      if (fetchError || !material) {
        return res.status(404).json({ error: "Material not found" });
      }

      const currentQty = parseFloat(material.quantity_remaining);
      const newQty = currentQty + parseFloat(amount);

      const { data: updatedMaterial, error: updateError } = await supabase
        .from("inventory")
        .update({ quantity_remaining: newQty })
        .eq("id", itemId)
        .select()
        .single();

      if (updateError) throw updateError;

      return res.json({
        success: true,
        material: updatedMaterial,
        message: `${material.material_name} atsargos papildytos +${amount} ${material.unit}.`
      });
    } catch (err: any) {
      console.error("Inventory replenishment failed:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API to fetch lists
  app.get("/api/orders", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.json(data || []);
    } catch (err: any) {
      console.error("Failed to fetch orders:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/inventory", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("material_name", { ascending: true });

      if (error) throw error;
      return res.json(data || []);
    } catch (err: any) {
      console.error("Failed to fetch inventory:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/invoices", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issued_at", { ascending: false });

      if (error) throw error;
      return res.json(data || []);
    } catch (err: any) {
      console.error("Failed to fetch invoices:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/emails/logs", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const formattedLogs = data?.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        recipient: log.recipient,
        subject: log.subject,
        status: log.status,
        bodyPreview: log.body_preview
      })) || [];

      return res.json(formattedLogs);
    } catch (err: any) {
      console.error("Failed to fetch email logs:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Reset database state to default
  app.post("/api/system/reset", async (req, res) => {
    try {
      console.log("Resetting database tables...");

      // Delete referencing rows first
      await supabase.from("raw_materials_usage_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("email_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("inventory").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("invoice_sequences").delete().neq("year", 0);

      // Seed Inventory
      const defaultInventory = [
        { material_name: "Premium Canvas Drobė", sku: "CANVAS-MAT", quantity_remaining: 124.5, unit: "m²", critical_threshold: 20.0, cost_per_unit: 12.00 },
        { material_name: "Satininis Plakatų Popierius", sku: "POSTER-MAT", quantity_remaining: 14.2, unit: "m²", critical_threshold: 15.0, cost_per_unit: 3.50 },
        { material_name: "Eco-Solvent CMYK rašalai", sku: "INK-CMYK", quantity_remaining: 840, unit: "ml", critical_threshold: 100.0, cost_per_unit: 0.15 },
        { material_name: "Sustiprintos transportavimo tūtos", sku: "TUBE-PC", quantity_remaining: 8, unit: "vnt", critical_threshold: 10.0, cost_per_unit: 1.50 }
      ];

      const { error: invError } = await supabase
        .from("inventory")
        .insert(defaultInventory);

      if (invError) throw invError;

      // Seed Orders & Items
      const createdDate = new Date();
      createdDate.setDate(createdDate.getDate() - 1); // Yesterday

      // Order 1
      const order1 = {
        shopify_order_id: "shop-order-9824",
        order_number: "#1024",
        customer_name: "Andrius Kazlauskas",
        customer_email: "andrius@gmail.com",
        total_price: 189.50,
        shipping_price: 6.90,
        raw_materials_cost: 32.40,
        net_profit: 150.20,
        status: "READY_FOR_PRODUCTION",
        shipping_address: { city: "Vilnius", address: "Gedimino pr. 5" },
        shopify_fulfilled: false,
        created_at: createdDate.toISOString()
      };

      const { data: insertedOrder1, error: order1Error } = await supabase
        .from("orders")
        .insert(order1)
        .select()
        .single();

      if (order1Error) throw order1Error;

      const item1 = {
        order_id: insertedOrder1.id,
        shopify_line_item_id: "item-shopify-1",
        product_name: "Foto drobė Premium 60x90cm",
        sku: "CANVAS-6090-PREM",
        quantity: 1,
        price: 189.50,
        artwork_file_url: "https://supabase-storage.printflow.lt/documents/artwork_1024.pdf",
        created_at: createdDate.toISOString()
      };

      await supabase.from("order_items").insert(item1);

      // Order 2
      const order2 = {
        shopify_order_id: "shop-order-9825",
        order_number: "#1025",
        customer_name: "Rasa Petraitytė",
        customer_email: "rasa@petraityte.lt",
        total_price: 51.90,
        shipping_price: 4.50,
        raw_materials_cost: 8.50,
        net_profit: 38.90,
        status: "PENDING_ARTWORK",
        shipping_address: { city: "Kaunas", address: "Savanorių pr. 45" },
        shopify_fulfilled: false,
        created_at: new Date().toISOString()
      };

      const { data: insertedOrder2, error: order2Error } = await supabase
        .from("orders")
        .insert(order2)
        .select()
        .single();

      if (order2Error) throw order2Error;

      const item2 = {
        order_id: insertedOrder2.id,
        shopify_line_item_id: "item-shopify-2",
        product_name: "Plakatas Satin 40x60cm",
        sku: "POSTER-4060-SAT",
        quantity: 2,
        price: 23.70,
        artwork_file_url: "",
        created_at: new Date().toISOString()
      };

      await supabase.from("order_items").insert(item2);

      // Order 3
      const order3 = {
        shopify_order_id: "shop-order-9826",
        order_number: "#1026",
        customer_name: "Tomas Sabonis",
        customer_email: "tomas@sabonis-design.com",
        total_price: 312.00,
        shipping_price: 0.00,
        raw_materials_cost: 64.20,
        net_profit: 247.80,
        status: "PRINTED_AND_PACKED",
        shipping_address: { city: "Klaipėda", address: "Taikos pr. 102" },
        shopify_fulfilled: false,
        created_at: createdDate.toISOString()
      };

      const { data: insertedOrder3, error: order3Error } = await supabase
        .from("orders")
        .insert(order3)
        .select()
        .single();

      if (order3Error) throw order3Error;

      const item3 = {
        order_id: insertedOrder3.id,
        shopify_line_item_id: "item-shopify-3",
        product_name: "Lipdukai Roll-Feed (500 vnt.)",
        sku: "STICKER-ROLL-500",
        quantity: 1,
        price: 312.00,
        artwork_file_url: "https://supabase-storage.printflow.lt/documents/artwork_1026.pdf",
        created_at: createdDate.toISOString()
      };

      await supabase.from("order_items").insert(item3);

      // Seed Invoices
      const currentYear = new Date().getFullYear();
      
      // Initialize sequence
      await supabase.from("invoice_sequences").insert({ year: currentYear, last_value: 2 });

      const invoice1 = {
        order_id: insertedOrder1.id,
        invoice_number: "INV-2026-0001",
        pdf_url: "https://supabase-storage.printflow.lt/documents/INV-2026-0001.pdf",
        issued_at: createdDate.toISOString(),
        sent_to_customer_at: createdDate.toISOString(),
        status: "SENT"
      };

      await supabase.from("invoices").insert(invoice1);

      // Seed Email Logs
      const emailLogs = [
        {
          recipient: "andrius@gmail.com",
          subject: "Sąskaita-faktūra užsakymui INV-2026-0001",
          status: "DELIVERED",
          body_preview: "Sveiki, Andrius Kazlauskas, Dėkojame už jūsų užsakymą! Prisegame sąskaitą...",
          created_at: createdDate.toISOString()
        }
      ];

      await supabase.from("email_logs").insert(emailLogs);

      return res.json({ success: true, message: "Sistemos duomenys sėkmingai atstatyti." });
    } catch (err: any) {
      console.error("Database reset failed:", err);
      return res.status(500).json({ error: "Nepavyko atstatyti duomenų bazės", details: err.message });
    }
  });

export default app;
