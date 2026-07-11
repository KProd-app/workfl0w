import app from "./server";
import express from "express";
import * as path from "path";
import { createServer as createViteServer } from "vite";

const PORT = process.env.PORT || 3000;

async function startLocalServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting local dev server with Vite HMR middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting local production server...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`Local Printflow ERP server running on http://localhost:${PORT}`);
  });
}

startLocalServer();
