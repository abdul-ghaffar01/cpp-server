# Use Node.js base image with Debian (glibc support)
FROM node:18-bullseye

# Set working directory
WORKDIR /exec-server

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy server.js and files folder
COPY server.js .
COPY apps ./apps

# Give execute permission to binaries in apps folder
RUN chmod +x ./apps/*

# Expose port (Express listens on 4000)
EXPOSE 4000

# Start server
CMD ["node", "server.js"]
