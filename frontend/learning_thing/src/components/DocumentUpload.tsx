import { useState, useEffect } from "react";
import { Upload, Loader, FileText, Trash2, AlertCircle } from "lucide-react";

interface DocumentUploadProps {
  folderId: string | null;
}

interface UploadError {
  filename: string;
  error: string;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ folderId }) => {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<UploadError[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const loadDocuments = async () => {
    if (!folderId) return;
    try {
      const response = await fetch(
        `http://localhost:8000/folders/${folderId}/documents`
      );
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [folderId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !folderId) return;
    setUploading(true);
    setUploadErrors([]);
    const files = Array.from(e.target.files);
    setProgress({ current: 0, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        try {
          const response = await fetch(
            `http://localhost:8000/upload/${folderId}`,
            {
              method: "POST",
              body: formData,
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            setUploadErrors((prev) => [
              ...prev,
              {
                filename: file.name,
                error: errorData.detail || "Upload failed",
              },
            ]);
            continue;
          }

          setProgress((prev) =>
            prev ? { ...prev, current: prev.current + 1 } : null
          );
        } catch (error) {
          setUploadErrors((prev) => [
            ...prev,
            {
              filename: file.name,
              error: "Upload failed",
            },
          ]);
        }
      }

      // Refresh document list after all uploads
      await loadDocuments();
    } finally {
      setUploading(false);
      setProgress(null);
      // Clear the file input
      e.target.value = "";
    }
  };

  const handleDeleteFile = async (filename: string) => {
    if (!folderId) return;
    try {
      setDeletingFile(filename);
      const response = await fetch(
        `http://localhost:8000/folders/${folderId}/files/${filename}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        await loadDocuments();
      } else {
        console.error("Failed to delete file:", await response.text());
      }
    } catch (error) {
      console.error("Error deleting file:", error);
    } finally {
      setDeletingFile(null);
    }
  };

  if (!folderId) return null;

  return (
    <div className="p-1 border-b dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-med dark:text-white">Add Materials</h2>
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer">
          <Upload size={20} />
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
      </div>
      <div className="space-y-2">
        {uploading && (
          <div className="flex flex-col gap-2 text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Loader className="animate-spin" size={16} />
              <span>
                {progress
                  ? `Uploading (${progress.current}/${progress.total})...`
                  : "Uploading..."}
              </span>
            </div>
          </div>
        )}

        {uploadErrors.length > 0 && (
          <div className="mt-2 space-y-1">
            {uploadErrors.map((error, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
                <AlertCircle size={16} />
                <span>
                  {error.filename}: {error.error}
                </span>
              </div>
            ))}
          </div>
        )}

        {documents.map((doc: string) => (
          <div
            key={doc}
            className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-500" />
              <span className="dark:text-white">{doc}</span>
            </div>
            <button
              onClick={() => handleDeleteFile(doc)}
              disabled={deletingFile === doc}
              className={`p-1 hover:text-red-500 transition-colors ${
                deletingFile === doc ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title="Delete file">
              {deletingFile === doc ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentUpload;
