import axios from 'axios';

// Get host based on deployment environment
function getHost(): string {
  const hostname = window.location.hostname;

  if (hostname.includes('runonflux')) {
    return hostname;
  } else if (hostname.includes('.cyberfly.io')) {
    return hostname;
  } else if (hostname.includes('.vercel.app')) {
    return 'node.cyberfly.io';
  } else {
    return `${hostname}:31003`;
  }
}

// Get API URL from localStorage or construct from host
export function getApiBaseUrl(): string {
  const stored = localStorage.getItem('cyberfly_api_url');
  if (stored) {
    return stored;
  }

  const host = getHost();
  const protocol = window.location.protocol; // Get the current protocol
  return `${protocol}//${host}`;
}

const API_BASE_URL = getApiBaseUrl();

// Use relative path for local development (Vite proxy) or full URL for production
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const GRAPHQL_ENDPOINT = isLocalDev ? '/graphql' : `${API_BASE_URL}/graphql`;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// GraphQL Query Helper
export async function graphqlQuery<T>(query: string, variables?: Record<string, any>): Promise<T> {
  const response = await axiosInstance.post(GRAPHQL_ENDPOINT, {
    query,
    variables,
  });

  if (response.data.errors) {
    throw new Error(response.data.errors[0].message);
  }

  return response.data.data;
}

// Node Info
export interface NodeInfo {
  nodeId: string;
  peerId: string;
  health: string;
  connectedPeers: number;
  discoveredPeers: number;
  uptimeSeconds: number;
  relayUrl?: string;
  region?: string;
}

export async function getNodeInfo(): Promise<NodeInfo> {
  const query = `
    query {
      getNodeInfo {
        nodeId
        peerId
        health
        connectedPeers
        discoveredPeers
        uptimeSeconds
        relayUrl
        region
      }
    }
  `;
  const data = await graphqlQuery<{ getNodeInfo: NodeInfo }>(query);
  return data.getNodeInfo;
}

// Connected Peers
export interface Peer {
  peerId: string;
  connectionStatus: string;
  lastSeen: string;
}

export async function getConnectedPeers(): Promise<Peer[]> {
  const query = `
    query {
      getConnectedPeers {
        peerId
        connectionStatus
        lastSeen
      }
    }
  `;
  const data = await graphqlQuery<{ getConnectedPeers: Peer[] }>(query);
  return data.getConnectedPeers;
}

// Discovered Peers
export async function getDiscoveredPeers(): Promise<Peer[]> {
  const query = `
    query {
      getDiscoveredPeers {
        peerId
        connectionStatus
        lastSeen
        address
      }
    }
  `;
  const data = await graphqlQuery<{ getDiscoveredPeers: Peer[] }>(query);
  return data.getDiscoveredPeers;
}

// Submit Data
export interface DataSubmission {
  storeType: 'String' | 'Hash' | 'List' | 'Set' | 'SortedSet' | 'Json' | 'Stream' | 'TimeSeries' | 'Geo';
  key: string;
  value: any;
  publicKey: string;
  signature: string;
  timestamp?: number;
  dbName?: string;
  field?: string;
  score?: number;
  jsonPath?: string;
  streamFields?: string;
  longitude?: number;
  latitude?: number;
}

export async function submitData(data: DataSubmission): Promise<string> {
  // Generate dbName if not provided
  const dbName = data.dbName || `mydb-${data.publicKey}`;

  // Convert value to JSON string
  const valueStr = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);

  const mutation = `
    mutation($input: SignedData!) {
      submitData(input: $input) {
        success
        message
      }
    }
  `;

  const input = {
    dbName,
    key: data.key,
    value: valueStr,
    publicKey: data.publicKey,
    signature: data.signature,
    storeType: data.storeType,
    ...(data.field && { field: data.field }),
    ...(data.score !== undefined && { score: data.score }),
    ...(data.jsonPath && { jsonPath: data.jsonPath }),
    ...(data.streamFields && { streamFields: data.streamFields }),
    ...(data.timestamp && { timestamp: data.timestamp.toString() }),
    ...(data.longitude !== undefined && { longitude: data.longitude }),
    ...(data.latitude !== undefined && { latitude: data.latitude }),
  };

  const result = await graphqlQuery<{ submitData: { success: boolean; message: string } }>(mutation, {
    input,
  });

  if (!result.submitData.success) {
    throw new Error(result.submitData.message);
  }

  return result.submitData.message;
}

// Query Data
export interface QueryFilter {
  storeType?: string;
  keyPattern?: string;
  limit?: number;
  offset?: number;
}

export interface DataEntry {
  key: string;
  storeType: string;
  value: any;
  metadata?: {
    publicKey: string;
    signature: string;
    timestamp: number;
  };
}

// Query Data - Note: This function is deprecated as the schema doesn't support it
// Use getDataByDbName or getDataByDbNameAndType instead
export async function queryData(_filter: QueryFilter): Promise<DataEntry[]> {
  console.warn('queryData is deprecated - use getDataByDbName instead');
  // Return empty array since this query doesn't exist in the schema
  return [];
}

// Get All Data - Note: This function is deprecated as the schema doesn't support it
// Use getDataByDbName or getDataByDbNameAndType instead
export async function getAllData(_storeType?: string, _limit?: number): Promise<DataEntry[]> {
  console.warn('getAllData is deprecated - use getDataByDbName instead');
  // Return empty array since this query doesn't exist in the schema
  return [];
}

// Query by Database Name and Type
export async function getDataByDbNameAndType(
  dbName: string,
  storeType: string
): Promise<DataEntry[]> {
  let query = '';
  let queryName = '';

  switch (storeType.toLowerCase()) {
    case 'string':
      queryName = 'getAllStrings';
      query = `
        query($dbName: String!) {
          getAllStrings(dbName: $dbName) {
            key
            value
            publicKey
            signature
          }
        }
      `;
      break;
    case 'hash':
      queryName = 'getAllHashes';
      query = `
        query($dbName: String!) {
          getAllHashes(dbName: $dbName) {
            key
            fields
            publicKey
            signature
          }
        }
      `;
      break;
    case 'list':
      queryName = 'getAllLists';
      query = `
        query($dbName: String!) {
          getAllLists(dbName: $dbName) {
            key
            items
            publicKey
            signature
          }
        }
      `;
      break;
    case 'set':
      queryName = 'getAllSets';
      query = `
        query($dbName: String!) {
          getAllSets(dbName: $dbName) {
            key
            members
            publicKey
            signature
          }
        }
      `;
      break;
    case 'sortedset':
      queryName = 'getAllSortedSets';
      query = `
        query($dbName: String!) {
          getAllSortedSets(dbName: $dbName) {
            key
            members
            publicKey
            signature
          }
        }
      `;
      break;
    case 'json':
      queryName = 'getAllJsons';
      query = `
        query($dbName: String!) {
          getAllJsons(dbName: $dbName) {
            key
            data
            publicKey
            signature
            timestamp
          }
        }
      `;
      break;
    case 'stream':
      queryName = 'getAllStreams';
      query = `
        query($dbName: String!) {
          getAllStreams(dbName: $dbName) {
            key
            entries
            publicKey
            signature
          }
        }
      `;
      break;
    case 'timeseries':
      queryName = 'getAllTimeseries';
      query = `
        query($dbName: String!) {
          getAllTimeseries(dbName: $dbName) {
            key
            points
            publicKey
            signature
          }
        }
      `;
      break;
    case 'geo':
      queryName = 'getAllGeo';
      query = `
        query($dbName: String!) {
          getAllGeo(dbName: $dbName) {
            key
            locations
            publicKey
            signature
          }
        }
      `;
      break;
    default:
      throw new Error(`Unknown store type: ${storeType}`);
  }

  const result = await graphqlQuery<any>(query, { dbName });
  const rawData = result[queryName];

  // Transform to common format
  return rawData.map((item: any) => ({
    key: item.key.replace(`${dbName}:`, ''), // Remove dbName prefix
    storeType,
    value: item.value || item.fields || item.items || item.members || item.data || item.entries || item.points || item.locations,
    metadata: item.publicKey ? {
      publicKey: item.publicKey,
      signature: item.signature,
      timestamp: item.timestamp || 0,
    } : undefined,
  }));
}

// Get data by dbName (all types)
export async function getDataByDbName(dbName: string): Promise<DataEntry[]> {
  const query = `
    query($dbName: String!) {
      getAll(dbName: $dbName) {
        key
        storeType
        value
        publicKey
        signature
      }
    }
  `;

  const result = await graphqlQuery<{ getAll: any[] }>(query, { dbName });

  return result.getAll.map((item: any) => ({
    key: item.key.replace(`${dbName}:`, ''), // Remove dbName prefix
    storeType: item.storeType,
    value: item.value,
    metadata: item.publicKey ? {
      publicKey: item.publicKey,
      signature: item.signature,
      timestamp: 0,
    } : undefined,
  }));
}

// Blob Operations
export async function uploadBlob(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('blob', file);

  const response = await axiosInstance.post('/blobs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data.hash;
}

export async function downloadBlob(hash: string): Promise<Blob> {
  const response = await axiosInstance.get(`/blobs/${hash}`, {
    responseType: 'blob',
  });

  return response.data;
}

// Metrics (Prometheus format)
export async function getMetrics(): Promise<string> {
  const response = await axiosInstance.get('/metrics');
  return response.data;
}

// Peer Connection
export async function dialPeer(peerId: string): Promise<{ success: boolean; message: string }> {
  const query = `
    mutation($peerId: String!) {
      dialPeer(peerId: $peerId) {
        success
        message
      }
    }
  `;

  const response = await axiosInstance.post('/graphql', {
    query,
    variables: { peerId },
  });

  if (response.data.errors) {
    throw new Error(response.data.errors[0].message);
  }

  return response.data.data.dialPeer;
}

// AI Inference
export interface InferenceJobInput {
  modelName: string;
  inputUri: string;
  maxLatencyMs?: number;
}

export interface InferenceJobSubmitResult {
  success: boolean;
  message: string;
  jobId: string;
}

export async function submitInferenceJob(input: InferenceJobInput): Promise<InferenceJobSubmitResult> {
  const mutation = `
    mutation($input: InferenceJobInput!) {
      submitInferenceJob(input: $input) {
        success
        message
        jobId
      }
    }
  `;

  // GraphQL expects snake_case for input fields usually, unless mapped.
  // Based on Rust structs using standard serde/async-graphql, fields are usually camelCase in GraphQL if not specified otherwise.
  // However, Rust field `model_name` usually becomes `modelName` in GraphQL.
  // Let's assume standard mapping: code uses snake_case struct fields, GraphQL exposes camelCase.

  const result = await graphqlQuery<{ submitInferenceJob: InferenceJobSubmitResult }>(mutation, {
    input,
  });

  return result.submitInferenceJob;
}

// Get Inference Job Status
export interface InferenceJob {
  jobId: string;
  modelName: string;
  inputUri: string;
  maxLatencyMs: number;
  status: string;
  createdAt: number;
  requester: string;
}

export async function getInferenceJob(jobId: string): Promise<InferenceJob | null> {
  const query = `
    query($jobId: String!) {
      getInferenceJob(jobId: $jobId) {
        jobId
        modelName
        inputUri
        maxLatencyMs
        status
        createdAt
        requester
      }
    }
  `;

  try {
    const result = await graphqlQuery<{ getInferenceJob: InferenceJob | null }>(query, { jobId });
    return result.getInferenceJob;
  } catch {
    return null;
  }
}

// Get Inference Result
export interface InferenceResult {
  jobId: string;
  nodeId: string;
  outputUri: string;
  latencyMs: number;
  completedAt: number;
  success: boolean;
  error?: string;
}

// File Metadata
export interface FileMetadata {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

// Inference Result Metadata (enhanced)
export interface InferenceResultMetadata {
  jobId: string;
  outputType: string;
  outputBlobHash: string;
  fileMetadata?: FileMetadata;
  completedAt: string;
  success: boolean;
  error?: string;
  latencyMs: number;
  nodeId: string;
}

export async function getInferenceResult(jobId: string): Promise<InferenceResult | null> {
  const query = `
    query($jobId: String!) {
      getInferenceResult(jobId: $jobId) {
        jobId
        nodeId
        outputUri
        latencyMs
        completedAt
        success
        error
      }
    }
  `;

  try {
    const result = await graphqlQuery<{ getInferenceResult: InferenceResult | null }>(query, { jobId });
    return result.getInferenceResult;
  } catch {
    return null;
  }
}

// Get Inference Result Metadata (enhanced with file info)
export async function getInferenceResultMetadata(jobId: string): Promise<InferenceResultMetadata | null> {
  const query = `
    query($jobId: String!) {
      getInferenceResultMetadata(jobId: $jobId) {
        jobId
        outputType
        outputBlobHash
        fileMetadata {
          filename
          mimeType
          sizeBytes
        }
        completedAt
        success
        error
        latencyMs
        nodeId
      }
    }
  `;

  try {
    const result = await graphqlQuery<{ getInferenceResultMetadata: InferenceResultMetadata | null }>(query, { jobId });
    return result.getInferenceResultMetadata;
  } catch (error) {
    console.error('Error fetching inference result metadata:', error);
    return null;
  }
}

export default axiosInstance;
