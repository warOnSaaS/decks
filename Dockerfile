FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Chromium for PDF export and slide previews (Playwright's build, with the system libraries it needs).
RUN npx playwright-core install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY . .
RUN mkdir -p /data && chown -R node:node /data /root/.cache 2>/dev/null; cp -r /root/.cache/ms-playwright /home/node/.cache-ms-playwright 2>/dev/null; chown -R node:node /home/node
USER node
ENV PORT=3996 SQLITE_FILE=/data/decks.db FILES_DIR=/data/files PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache-ms-playwright
EXPOSE 3996
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
