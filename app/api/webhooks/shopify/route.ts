/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client
// Note: In Next.js, these are typical environment variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Shopify Webhook client secret used to verify webhook legitimacy
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "your_shopify_secret_token";

/**
 * Next.js App Router Webhook endpoint for Shopify 'orders/create'
 * Path: /api/webhooks/shopify
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Read raw body as text to correctly compute HMAC SHA256
    const rawBody = await req.text();

    // 2. Extract Shopify signature from headers
    const shopifyHmac = req.headers.get("X-Shopify-Hmac-SHA256") || req.headers.get("x-shopify-hmac-sha256");

    if (!shopifyHmac) {
      console.error("Missing X-Shopify-Hmac-SHA256 header");
      return NextResponse.json({ error: "Missing Shopify signature" }, { status: 401 });
    }

    // 3. Compute local HMAC SHA256 using the Shopify client secret and the raw request body
    const calculatedHmac = crypto
      .createHmac("sha256", SHOPIFY_WEBHOOK_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    // 4. Constant-time comparison of signatures to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(shopifyHmac, "base64"),
      Buffer.from(calculatedHmac, "base64")
    );

    if (!isValid) {
      console.error("HMAC signature verification failed!");
      return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 });
    }

    // 5. Parse webhook JSON payload
    const orderData = JSON.parse(rawBody);
    console.log(`Successfully verified Shopify order webhook. Shopify Order ID: ${orderData.id}`);

    // Extract relevant Shopify order fields
    const shopifyOrderId = String(orderData.id);
    const orderNumber = String(orderData.order_number || orderData.name);
    const totalPrice = parseFloat(orderData.total_price || "0.00");
    const shippingPrice = parseFloat(orderData.shipping_lines?.[0]?.price || "0.00");
    const customerName = `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Shopify Customer";
    const customerEmail = orderData.customer?.email || orderData.email || "";
    const shippingAddress = orderData.shipping_address || {};

    // Calculate initial raw materials cost based on line items SKU metadata, or leave 0 to compute dynamically
    let calculatedMaterialsCost = 0.00;

    // Map Shopify items to the db structure
    const lineItems = (orderData.line_items || []).map((item: any) => {
      // Simple mock logic: assign raw material cost per item SKU
      // In production, this would look up prices in the 'inventory' table
      const sku = item.sku || "UNKNOWN_SKU";
      let estimatedCost = 1.50; // default estimated raw material cost per item
      if (sku.includes("CANVAS")) estimatedCost = 12.50;
      else if (sku.includes("POSTER")) estimatedCost = 3.00;
      else if (sku.includes("STICKER")) estimatedCost = 0.50;

      calculatedMaterialsCost += estimatedCost * (item.quantity || 1);

      return {
        shopify_line_item_id: String(item.id),
        product_name: item.title,
        sku: sku,
        quantity: item.quantity || 1,
        price: parseFloat(item.price || "0.00"),
      };
    });

    const netProfit = totalPrice - calculatedMaterialsCost - shippingPrice;

    // 6. Insert Order into Supabase
    const { data: orderRow, error: orderError } = await supabase
      .from("orders")
      .insert({
        shopify_order_id: shopifyOrderId,
        order_number: orderNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        total_price: totalPrice,
        shipping_price: shippingPrice,
        raw_materials_cost: calculatedMaterialsCost,
        net_profit: netProfit,
        status: "PENDING_ARTWORK", // Initial state
        shipping_address: shippingAddress,
      })
      .select()
      .single();

    if (orderError) {
      console.error("Database error while inserting order:", orderError);
      return NextResponse.json({ error: "Database transaction failed", details: orderError.message }, { status: 500 });
    }

    const dbOrderId = orderRow.id;

    // 7. Insert Order Items associated with this order
    const orderItemsToInsert = lineItems.map((item: any) => ({
      order_id: dbOrderId,
      ...item,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsToInsert);

    if (itemsError) {
      console.error("Database error while inserting order items:", itemsError);
      // Rollback order insert or log warning (PostgreSQL foreign keys ensure cascade if deleted)
      await supabase.from("orders").delete().eq("id", dbOrderId);
      return NextResponse.json({ error: "Database transaction failed for items", details: itemsError.message }, { status: 500 });
    }

    // 8. Return success response to Shopify (important: Shopify expects a fast 200 OK)
    return NextResponse.json({
      success: true,
      order_id: dbOrderId,
      status: "PENDING_ARTWORK",
      message: "Order received and saved to production queue"
    }, { status: 200 });

  } catch (error: any) {
    console.error("Shopify Webhook Handler Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
