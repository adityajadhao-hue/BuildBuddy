/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Suppress warnings from optional peer dependencies in WalletConnect/MetaMask SDK
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false,
    };
    config.externals = [...(config.externals || []), '@react-native-async-storage/async-storage'];
    return config;
  },
};

module.exports = nextConfig;
