"use client";

import { createDocument } from "@/lib/actions/room.actions";
import { documentTemplates } from "@/lib/templates";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TemplateSelector from "./TemplateSelector";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface TemplatesShowcaseProps {
  userId: string;
  email: string;
}

const TemplatesShowcase = ({ userId, email }: TemplatesShowcaseProps) => {
  const router = useRouter();
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  // Show only the first 4 templates as a preview
  const featuredTemplates = documentTemplates.slice(1, 5); // Skip blank template

  const handleTemplateClick = async (templateId: string) => {
    try {
      const room = await createDocument({ userId, email, templateId });
      if (room) {
        router.push(`/documents/${room.id}`);
      }
    } catch (error) {
      console.log("Error creating document from template:", error);
    }
  };

  return (
    <>
      <div className="mt-8 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">
            Start with a template
          </h3>
          <Button
            variant="outline"
            onClick={() => setShowAllTemplates(true)}
            className="text-sm text-black"
          >
            View all templates
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {featuredTemplates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-700 rounded-lg p-3 hover:border-blue-500 transition-colors cursor-pointer bg-dark-300 group"
              onClick={() => handleTemplateClick(template.id)}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-md bg-dark-500 flex items-center justify-center mb-3 group-hover:bg-dark-400 transition-colors">
                  <Image
                    src={template.icon}
                    alt={template.title}
                    width={24}
                    height={24}
                  />
                </div>
                <h4 className="font-medium text-white text-sm mb-1">
                  {template.title}
                </h4>
                <p className="text-xs text-gray-400 line-clamp-2">
                  {template.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showAllTemplates} onOpenChange={setShowAllTemplates}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Templates</DialogTitle>
          </DialogHeader>
          <TemplateSelector
            userId={userId}
            email={email}
            onClose={() => setShowAllTemplates(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplatesShowcase;
