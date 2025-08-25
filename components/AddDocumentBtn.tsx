"use client";

import { createDocument } from "@/lib/actions/room.actions";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import TemplateSelector from "./TemplateSelector";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const AddDocumentBtn = ({ userId, email }: AddDocumentBtnProps) => {
  const router = useRouter();
  const [showTemplates, setShowTemplates] = useState(false);

  const addDocumentHandler = async () => {
    try {
      const room = await createDocument({ userId, email });

      if (room) router.push(`/documents/${room.id}`);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="submit"
          onClick={addDocumentHandler}
          className="gradient-blue flex gap-1 shadow-md"
        >
          <Image src="/assets/icons/add.svg" alt="add" width={24} height={24} />
          <p className="hidden sm:block">Start a blank document</p>
        </Button>

        <Button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="gradient-blue border-0 flex gap-1 shadow-md"
          variant="outline"
        >
          <Image
            src="/assets/icons/file.svg"
            alt="template"
            width={24}
            height={24}
          />
          <p className="hidden sm:block ">Choose template</p>
        </Button>
      </div>

      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a Template</DialogTitle>
          </DialogHeader>
          <TemplateSelector
            userId={userId}
            email={email}
            onClose={() => setShowTemplates(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AddDocumentBtn;
