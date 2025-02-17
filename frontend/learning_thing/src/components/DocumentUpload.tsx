// src/components/DocumentUpload.tsx
import { useState, useEffect } from "react";
import { Upload, Loader, FileText } from "lucide-react";

interface DocumentUploadProps {
  folderId: string | null;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ folderId }) => {
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);

  useEffect(() => {
    // Load documents for this folder
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

    loadDocuments();
  }, [folderId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !folderId) return;

    setUploading(true);
    const files = Array.from(e.target.files);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `http://localhost:8000/upload/${folderId}`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) throw new Error("Upload failed");

        const data = await response.json();
        setDocuments((prev: string[]) => [...prev, data.filename]);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
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
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <Loader className="animate-spin" size={16} />
            <span>Uploading...</span>
          </div>
        )}

        {documents.map((doc: string, index: number) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <FileText size={16} className="text-blue-500" />
            <span className="dark:text-white">{doc}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentUpload;
