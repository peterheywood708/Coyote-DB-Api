# Build stage
FROM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev \
    && npm install typescript -g \
    && npm cache clean --force

# Copy the rest of the application code
COPY . .

# Build the application
RUN tsc

# Runtime stage
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership of the working directory to the non-root user
COPY --chown=nodejs:nodejs package*.json .

#Build package-lock.json in builder stage and copy it to runtime stage to ensure consistent dependencies
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Set permissions for the non-root user
USER nodejs

CMD ["node", "dist/index.js"]