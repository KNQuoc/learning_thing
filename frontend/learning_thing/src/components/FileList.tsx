import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Trash2, File } from "lucide-react";

interface FileListProps {
  folderId: string;
  onFileDeleted?: () => void;
}

export interface FileListRef {
  refresh: () => void;
}

const FileList = forwardRef<FileListRef, FileListProps>(
  ({ folderId, onFileDeleted }, ref) => {
    const [files, setFiles] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const fetchFiles = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/folders/${folderId}/documents`
        );
        if (response.ok) {
          const data = await response.json();
          setFiles(data.documents);
        }
      } catch (error) {
        console.error("Error fetching files:", error);
      }
    };

    useImperativeHandle(ref, () => ({
      refresh: fetchFiles,
    }));

    useEffect(() => {
      fetchFiles();
    }, [folderId]);

    const deleteFile = async (filename: string) => {
      try {
        setIsDeleting(filename);
        const response = await fetch(
          `http://localhost:8000/folders/${folderId}/files/${filename}`,
          {
            method: "DELETE",
          }
        );

        if (response.ok) {
          await fetchFiles();
          if (onFileDeleted) {
            onFileDeleted();
          }
        } else {
          console.error("Failed to delete file:", await response.text());
        }
      } catch (error) {
        console.error("Error deleting file:", error);
      } finally {
        setIsDeleting(null);
      }
    };

    if (files.length === 0) {
      return null;
    }

    return (
      <div className="mt-2 space-y-1">
        {files.map((filename) => (
          <div
            key={filename}
            className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-2 truncate">
              <File size={16} />
              <span className="truncate text-sm">{filename}</span>
            </div>
            <button
              onClick={() => deleteFile(filename)}
              disabled={isDeleting === filename}
              className={`p-1 hover:text-red-500 ${
                isDeleting === filename ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title="Delete file">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  }
);

FileList.displayName = "FileList";

export default FileList;
