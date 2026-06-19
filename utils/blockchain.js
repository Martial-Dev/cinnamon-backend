const ethers = require("ethers");
const crypto = require("crypto");

// For now, this is a mock implementation
// In production, connect to Ethereum/Polygon network

class BlockchainService {
  constructor() {
    // Initialize with your RPC provider
    // Example: Polygon Mumbai testnet
    this.provider = null;
    this.contract = null;
    this.signer = null;
  }

  /**
   * Initialize blockchain connection
   * @param {string} rpcUrl - Blockchain RPC endpoint
   * @param {string} privateKey - Signer private key (from env)
   * @param {string} contractAddress - Smart contract address
   * @param {string} contractABI - Contract ABI
   */
async initialize(rpcUrl, privateKey, contractAddress, contractABI) {
  try {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);          // was ethers.providers.JsonRpcProvider
    this.signer = new ethers.Wallet(privateKey, this.provider);   // unchanged
    this.contract = new ethers.Contract(contractAddress, contractABI, this.signer); // unchanged
    console.log("✓ Blockchain service initialized");
  } catch (error) {
    console.error("Blockchain initialization error:", error);
    throw error;
  }
}

async recordSupplierHash(supplierHash, supplierId) {
  try {
    if (!this.contract) throw new Error("Blockchain service not initialized");

    const tx = await this.contract.recordSupplier(supplierHash, supplierId, {
      gasLimit: 300000,
    });
    const receipt = await tx.wait();

    return {
      txId: receipt.hash,                    // was receipt.transactionHash
      blockNumber: receipt.blockNumber,
      network: "sepolia",
      contractAddress: this.contract.target,  // was this.contract.address
      explorerUrl: `https://sepolia.etherscan.io/tx/${receipt.hash}`,
      recordedAt: new Date(),
    };
  } catch (error) {
    console.error("Error recording supplier hash:", error);
    throw error;
  }
}
  /**
   * Verify supplier hash on blockchain
   * @param {string} supplierHash - Hash to verify
   * @param {string} supplierId - Supplier ID to verify against
   * @returns {boolean} True if hash matches on-chain record
   */
  async verifySupplierHash(supplierHash, supplierId) {
    try {
      if (!this.contract) {
        throw new Error("Blockchain service not initialized");
      }

      // Call read-only function
      const isValid = await this.contract.verifySupplier(
        supplierHash,
        supplierId,
      );
      return isValid;
    } catch (error) {
      console.error("Error verifying supplier hash:", error);
      throw error;
    }
  }

  /**
   * Mock implementation for development/testing
   * Use this until smart contract is deployed
   */
  async recordSupplierHashMock(supplierHash, supplierId) {
    return {
      txId: `0x${crypto.randomBytes(32).toString("hex")}`,
      blockNumber: Math.floor(Math.random() * 50000000),
      network: "polygon-mock",
      contractAddress: "0x0000000000000000000000000000000000000000",
      explorerUrl: `https://mumbai.polygonscan.com/tx/0x${crypto
        .randomBytes(32)
        .toString("hex")}`,
      recordedAt: new Date(),
    };
  }
}

module.exports = new BlockchainService();
