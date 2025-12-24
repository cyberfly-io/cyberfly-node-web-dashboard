import { useState, useRef, useEffect, useCallback } from 'react';
import { submitInferenceJob, uploadBlob, getApiBaseUrl, getInferenceJob, getInferenceResultMetadata } from '../api/client';
import type { InferenceJobSubmitResult, InferenceResultMetadata } from '../api/client';
import { Brain, Upload, Play, FileText, Loader2, AlertCircle, CheckCircle2, Clock, Music } from 'lucide-react';

const AVAILABLE_MODELS = [
    { id: 'mobilenet_v4', name: 'MobileNet V4 (Image Classification)', type: 'image' },
    { id: 'yolo11n', name: 'YOLO v11 Nano (Object Detection)', type: 'image' },
    { id: 'segformer', name: 'SegFormer (Image Segmentation)', type: 'image' },
    { id: 'paddleocr_en', name: 'PaddleOCR English (Text Recognition)', type: 'image' },
    { id: 'silero_vad', name: 'Silero VAD (Voice Activity Detection)', type: 'audio' },
    { id: 'dtln_denoise', name: 'DTLN (Audio Denoising)', type: 'audio' },
];

export default function AIInference() {
    const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<InferenceJobSubmitResult | null>(null);
    const [inferenceResult, setInferenceResult] = useState<InferenceResultMetadata | null>(null);
    const [jobStatus, setJobStatus] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);
    const [blobContent, setBlobContent] = useState<string | null>(null);
    const [blobLoading, setBlobLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const currentModelType = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.type || 'image';

    // Polling for job status and result
    const pollJobStatus = useCallback(async (jobId: string) => {
        try {
            const job = await getInferenceJob(jobId);
            if (job) {
                console.log('Job status:', job.status); // Debug logging
                setJobStatus(job.status);

                // Check if job is complete or failed
                // Backend returns status in Rust Debug format, e.g., "Running { ... }" or "Completed"
                // We need to check if the status string starts with these keywords
                const isTerminal =
                    job.status === 'Completed' ||
                    job.status.startsWith('Completed') ||
                    job.status.startsWith('Failed') ||
                    job.status.startsWith('TimedOut') ||
                    job.status.includes('Completed') ||
                    job.status.includes('Failed');

                if (isTerminal) {
                    console.log('Job terminal state detected, fetching result metadata');
                    // Try to get the result metadata
                    const resultData = await getInferenceResultMetadata(jobId);
                    if (resultData) {
                        console.log('Result metadata received:', resultData);
                        setInferenceResult(resultData);
                    } else {
                        console.warn('No result metadata available for job:', jobId);
                    }
                    setPolling(false);
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                }
            } else {
                console.warn('Job not found:', jobId);
            }
        } catch (err) {
            console.error('Failed to poll job status:', err);
        }
    }, []);

    // Start polling when job is submitted
    useEffect(() => {
        console.log('Polling effect triggered:', {
            hasResult: !!result,
            success: result?.success,
            jobId: result?.jobId,
            isPolling: polling
        });

        if (result?.success && result?.jobId && !polling) {
            console.log('Starting polling for job:', result.jobId);
            setPolling(true);
            setJobStatus('Pending');
            setInferenceResult(null);

            // Poll every 2 seconds
            const intervalId = setInterval(() => {
                console.log('Polling interval tick for job:', result.jobId);
                pollJobStatus(result.jobId);
            }, 2000);

            pollingRef.current = intervalId;

            // Also poll immediately
            console.log('Initial poll for job:', result.jobId);
            pollJobStatus(result.jobId);
        }

        return () => {
            if (pollingRef.current) {
                console.log('Cleaning up polling interval');
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [result?.success, result?.jobId]); // Don't include polling or pollJobStatus in dependencies!

    // Fetch blob content when inference result is available
    useEffect(() => {
        async function fetchBlobContent() {
            if (!inferenceResult?.outputBlobHash) {
                return;
            }

            const mimeType = inferenceResult.fileMetadata?.mimeType || '';
            const outputType = inferenceResult.outputType || '';

            // Fetch content for JSON or text-based types
            // Images and audio are handled by their native elements
            if (mimeType === 'application/json' ||
                mimeType.startsWith('text/') ||
                outputType === 'json' ||
                outputType.startsWith('text')) {

                setBlobLoading(true);
                try {
                    const response = await fetch(`${getApiBaseUrl()}/blobs/${inferenceResult.outputBlobHash}`);
                    const text = await response.text();

                    // Try to prettify JSON
                    if (mimeType === 'application/json' || outputType === 'json') {
                        try {
                            const parsed = JSON.parse(text);
                            setBlobContent(JSON.stringify(parsed, null, 2));
                        } catch {
                            setBlobContent(text);
                        }
                    } else {
                        setBlobContent(text);
                    }
                } catch (error) {
                    console.error('Failed to fetch blob content:', error);
                    setBlobContent(null);
                } finally {
                    setBlobLoading(false);
                }
            } else {
                setBlobContent(null);
            }
        }

        fetchBlobContent();
    }, [inferenceResult?.outputBlobHash, inferenceResult?.fileMetadata, inferenceResult?.outputType]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setLoading(true);
        setResult(null);
        setInferenceResult(null);
        setJobStatus(null);
        setPolling(false); // Reset polling state

        try {
            const hash = await uploadBlob(file);
            const inputUri = `${getApiBaseUrl()}/blobs/${hash}`;

            console.log('Submitting inference job:', { modelName: selectedModel, inputUri });
            const response = await submitInferenceJob({
                modelName: selectedModel,
                inputUri: inputUri,
                maxLatencyMs: 30000 // 30 seconds for model inference
            });
            console.log('Job submission response:', response);
            setResult(response);
        } catch (error: any) {
            console.error('Job submission error:', error);
            setResult({
                success: false,
                message: error.message || 'Failed to submit job',
                jobId: '',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <Brain className="w-8 h-8 text-blue-600" />
                        AI Inference
                    </h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Submit inference jobs to the decentralized network.
                    </p>
                </div>
            </div>

            {/* ... (rest of the component layout remains similar but updated for results) */}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Input Configuration Card */}
                <div className="glass dark:glass-dark rounded-2xl p-6 shadow-xl border border-white/20 dark:border-gray-700/50">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <Play className="w-5 h-5 text-blue-500" />
                        Run Configuration
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Select Model
                            </label>
                            <select
                                value={selectedModel}
                                onChange={(e) => {
                                    setSelectedModel(e.target.value);
                                    setFile(null);
                                    setResult(null);
                                    setInferenceResult(null);
                                    setJobStatus(null);
                                }}
                                className="w-full px-4 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            >
                                {AVAILABLE_MODELS.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* File Upload - Image or Audio based on model type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {currentModelType === 'audio' ? 'Upload Audio File' : 'Upload Image'}
                            </label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-white/30 dark:bg-gray-800/30"
                            >
                                {file ? (
                                    <div className="relative group w-full h-full flex flex-col items-center justify-center">
                                        {currentModelType === 'audio' ? (
                                            <>
                                                <Music className="w-12 h-12 text-purple-500 mb-2" />
                                                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                                    {file.name}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                                    {(file.size / 1024).toFixed(1)} KB
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt="Preview"
                                                    className="h-32 object-contain rounded-lg shadow-sm"
                                                />
                                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 font-medium">
                                                    {file.name}
                                                </p>
                                            </>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                            <span className="text-white font-medium">Click to change</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {currentModelType === 'audio' ? (
                                            <Music className="w-8 h-8 text-gray-400 mb-2" />
                                        ) : (
                                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                        )}
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            Click to upload {currentModelType === 'audio' ? 'an audio file' : 'an image'}
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            {currentModelType === 'audio' ? 'WAV, MP3, OGG' : 'PNG, JPG, WEBP'}
                                        </p>
                                    </>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={currentModelType === 'audio' ? 'audio/*' : 'image/*'}
                                    onChange={handleFileChange}
                                    className="hidden"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !file}
                            className={`w-full py-3 px-6 rounded-xl text-white font-semibold shadow-lg transition-all duration-300 flex items-center justify-center gap-2
                ${loading || !file
                                    ? 'bg-gray-400 cursor-not-allowed opacity-70'
                                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-blue-500/25 hover:scale-[1.02]'
                                }`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    Submit Job
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Results Card */}
                <div className="glass dark:glass-dark rounded-2xl p-6 shadow-xl border border-white/20 dark:border-gray-700/50 flex flex-col h-full">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-500" />
                        Job Status
                    </h2>

                    <div className="flex-1 bg-white/50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700 overflow-auto">
                        {result ? (
                            <div className="space-y-4">
                                <div className={`flex items-center gap-2 font-medium ${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                    }`}>
                                    {result.success ? (
                                        <CheckCircle2 className="w-5 h-5" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5" />
                                    )}
                                    {result.success ? 'Job Submitted' : 'Submission Failed'}
                                </div>

                                {result.jobId && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                                        <span className="text-sm text-blue-600 dark:text-blue-400 block mb-1">Job ID</span>
                                        <code className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{result.jobId}</code>
                                    </div>
                                )}

                                {/* Job Status */}
                                {jobStatus && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
                                            <span className={`text-sm font-bold ${jobStatus.includes('Completed') ? 'text-green-600 dark:text-green-400' :
                                                jobStatus.includes('Failed') || jobStatus.includes('TimedOut') ? 'text-red-600 dark:text-red-400' :
                                                    jobStatus.includes('Running') ? 'text-yellow-600 dark:text-yellow-400' :
                                                        'text-blue-600 dark:text-blue-400'
                                                }`}>
                                                {jobStatus}
                                            </span>
                                            {polling && (
                                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Inference Result */}
                                {inferenceResult && (
                                    <div className={`p-4 rounded-lg border ${inferenceResult.success
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                        }`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            {inferenceResult.success ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                                            ) : (
                                                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                            )}
                                            <span className="font-semibold text-gray-900 dark:text-white">
                                                {inferenceResult.success ? 'Inference Complete' : 'Inference Failed'}
                                            </span>
                                        </div>


                                        {inferenceResult.success && (
                                            <>
                                                <div className="mb-2">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">Latency:</span>
                                                    <span className="ml-2 text-sm font-mono text-gray-800 dark:text-gray-200">
                                                        {inferenceResult.latencyMs}ms
                                                    </span>
                                                </div>
                                                <div className="mb-2">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">Executed by:</span>
                                                    <code className="ml-2 text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                                                        {inferenceResult.nodeId}
                                                    </code>
                                                </div>

                                                {/* Output Type */}
                                                <div className="mb-2">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">Output Type:</span>
                                                    <span className="ml-2 text-sm font-mono text-gray-800 dark:text-gray-200">
                                                        {inferenceResult.outputType}
                                                    </span>
                                                </div>


                                                {/* File Metadata */}
                                                {inferenceResult.fileMetadata && (
                                                    <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                                        <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">File Information</div>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-blue-600 dark:text-blue-400">Filename:</span>
                                                                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                                                                    {inferenceResult.fileMetadata.filename}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-blue-600 dark:text-blue-400">Type:</span>
                                                                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                                                                    {inferenceResult.fileMetadata.mimeType}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-blue-600 dark:text-blue-400">Size:</span>
                                                                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">
                                                                    {(inferenceResult.fileMetadata.sizeBytes / 1024).toFixed(2)} KB
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Result Preview based on type */}
                                                {inferenceResult.outputBlobHash && (
                                                    <div className="mb-3">
                                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Result Preview:</span>

                                                        {/* Image Preview - only when fileMetadata indicates image */}
                                                        {inferenceResult.fileMetadata?.mimeType?.startsWith('image/') && (
                                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                                <img
                                                                    src={`${getApiBaseUrl()}/blobs/${inferenceResult.outputBlobHash}`}
                                                                    alt="Inference result"
                                                                    className="max-w-full h-auto rounded-lg shadow-sm"
                                                                    style={{ maxHeight: '400px' }}
                                                                />
                                                            </div>
                                                        )}

                                                        {/* JSON Preview - check outputType OR mimeType */}
                                                        {(inferenceResult.outputType === 'json' ||
                                                            inferenceResult.fileMetadata?.mimeType === 'application/json') && (
                                                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-96 overflow-auto">
                                                                    {blobLoading ? (
                                                                        <div className="flex items-center justify-center py-4">
                                                                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                                            <span className="ml-2 text-sm text-gray-500">Loading content...</span>
                                                                        </div>
                                                                    ) : blobContent ? (
                                                                        <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                                                            {blobContent}
                                                                        </pre>
                                                                    ) : (
                                                                        <span className="text-sm text-gray-500">Unable to load content</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                        {/* Audio Preview */}
                                                        {inferenceResult.fileMetadata?.mimeType?.startsWith('audio/') && (
                                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                                <audio
                                                                    controls
                                                                    className="w-full"
                                                                    src={`${getApiBaseUrl()}/blobs/${inferenceResult.outputBlobHash}`}
                                                                >
                                                                    Your browser does not support the audio element.
                                                                </audio>
                                                            </div>
                                                        )}

                                                        {/* Text Preview */}
                                                        {inferenceResult.fileMetadata?.mimeType?.startsWith('text/') && (
                                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-96 overflow-auto">
                                                                {blobLoading ? (
                                                                    <div className="flex items-center justify-center py-4">
                                                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                                        <span className="ml-2 text-sm text-gray-500">Loading content...</span>
                                                                    </div>
                                                                ) : blobContent ? (
                                                                    <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                                                        {blobContent}
                                                                    </pre>
                                                                ) : (
                                                                    <span className="text-sm text-gray-500">Unable to load content</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}


                                                {/* Blob Hash */}
                                                {inferenceResult.outputBlobHash && (
                                                    <div className="mb-2">
                                                        <span className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Output Blob Hash:</span>
                                                        <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all bg-white/50 dark:bg-gray-800/50 p-2 rounded block">
                                                            {inferenceResult.outputBlobHash}
                                                        </code>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {inferenceResult.error && (
                                            <div className="text-sm text-red-600 dark:text-red-400">
                                                Error: {inferenceResult.error}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {result.message && !inferenceResult && (
                                    <div className="text-gray-700 dark:text-gray-300">
                                        <span className="font-semibold block mb-1">Message:</span>
                                        {result.message}
                                    </div>
                                )}

                                {result.success && polling && (
                                    <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <Clock className="w-4 h-4" />
                                        <span>Polling for results...</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                                <Brain className="w-12 h-12 mb-3 opacity-20" />
                                <p>Submit a job to see status here</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
