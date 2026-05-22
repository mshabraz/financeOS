# FinanceOS — local LAN deployment (single container)
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend
WORKDIR /app
RUN apk add --no-cache tini
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV LAN_MODE=true
ENV AUTH_ENABLED=true
ENV SERVE_FRONTEND=true
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3001

WORKDIR /app/backend
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
