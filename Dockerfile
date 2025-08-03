# Use Node.js base image
FROM node:18-alpine

# Set working directory
WORKDIR /exec-server

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy server.js and files folder
COPY server.js .
COPY apps ./apps

# Give execute permission to files in the 'files' folder
RUN chmod +x ./apps/*

# Expose port (e.g., Express listens on 5000)
EXPOSE 4000

# Start server
CMD ["node", "server.js"]
