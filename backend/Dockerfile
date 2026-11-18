# ============================================================================
# FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
# PRODUCTION MULTI-STAGE DOCKERFILE FOR GOOGLE CLOUD RUN (api.loans.flotechdigital.com)
# ============================================================================

FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install deterministic dependencies
RUN npm ci

# Copy shared and backend sources
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY backend ./backend

# Build shared contracts and backend TypeScript
RUN npm run build --workspace=packages/shared && npm run build --workspace=backend

# Prune dev dependencies for lean production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --omit=dev

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/src/database/migrations ./backend/dist/database/migrations

USER node
EXPOSE 8080

CMD ["node", "backend/dist/server.js"]
