"use client";

import { createDocument } from "@/lib/actions/room.actions";
import { documentTemplates } from "@/lib/templates";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TemplateSelectorProps {
  userId: string;
  email: string;
  onClose?: () => void;
}

export default function TemplateSelector({
  userId,
  email,
  onClose,
}: TemplateSelectorProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const router = useRouter();

  const handleTemplateSelect = async (templateId: string) => {
    setIsLoading(templateId);

    try {
      const room = await createDocument({
        userId,
        email,
        templateId,
      });

      if (room) {
        router.push(`/documents/${room.id}`);
      }
    } catch (error) {
      console.error("Error creating document from template:", error);
    } finally {
      setIsLoading(null);
      if (onClose) onClose();
    }
  };

  return (
    <div className="template-selector">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Choose a Template
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Get started quickly with one of our predefined templates
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentTemplates.map((template) => (
          <div
            key={template.id}
            className="template-card group cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-800"
            onClick={() => handleTemplateSelect(template.id)}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0">
                <Image
                  src="/assets/icons/doc.svg"
                  alt="Document"
                  width={24}
                  height={24}
                  className="group-hover:scale-110 transition-transform duration-200"
                />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {template.title}
              </h3>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {template.description}
            </p>

            <div className="flex items-center justify-between">
              <span className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                {template.category}
              </span>

              {isLoading === template.id ? (
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className="text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  Use Template →
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
