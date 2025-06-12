# Multi-stage build for security and size
FROM node:24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /build
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Runtime stage
FROM node:24-alpine

# Install runtime dependencies only
RUN apk add --no-cache \
    tini \
    libstdc++ \
    procps \
    findutils \
    grep \
    ripgrep \
    fd \
    cargo \
    make \
    git \
    bash

# Create non-root user
RUN addgroup -g 1001 claude && \
    adduser -u 1001 -G claude -s /bin/bash -D claude

# Setup directories with proper permissions
RUN mkdir -p /var/lib/claude-yolt /var/log/claude-yolt /home/claude/.claude-yolt && \
    chown -R claude:claude /var/lib/claude-yolt /var/log/claude-yolt /home/claude/.claude-yolt

# Copy built application
COPY --from=builder --chown=claude:claude /build/node_modules /app/node_modules
COPY --from=builder --chown=claude:claude /build/dist /app/dist
COPY --from=builder --chown=claude:claude /build/bin /app/bin
COPY --from=builder --chown=claude:claude /build/lib /app/lib

WORKDIR /app
USER claude

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node /app/bin/claude-yolt --health-check || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/bin/claude-yolt"]

# Labels for Kubernetes
LABEL io.k8s.description="Claude YOLT Process Manager" \
      io.k8s.display-name="claude-yolt" \
      io.openshift.expose-services="9090:metrics" \
      io.openshift.tags="claude,ai,process-manager"