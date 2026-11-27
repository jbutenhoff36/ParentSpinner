import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Consequence } from "@shared/schema";

interface EditConsequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  consequence: Consequence | null;
  onSave: (consequence: Consequence) => void;
  onDelete: (id: number) => void;
}

export function EditConsequenceModal({ isOpen, onClose, consequence, onSave, onDelete }: EditConsequenceModalProps) {
  const [text, setText] = useState("");
  const [type, setType] = useState<string>("good");
  const [section, setSection] = useState<number>(1);

  useEffect(() => {
    setText(consequence?.text ?? "");
    setType(consequence?.type ?? "good");
    setSection(consequence?.section ?? 1);
  }, [consequence]);

  const handleSave = () => {
    if (!consequence) return;
    onSave({ ...consequence, text, type, section });
  };

  const handleDelete = () => {
    if (!consequence?.id) return;
    onDelete(consequence.id);
  };

  const sectionNumbers = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{consequence?.id ? "Edit Consequence" : "Add Consequence"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="section" className="block text-sm font-medium text-gray-700 mb-1">Section Number</Label>
            <Select value={section.toString()} onValueChange={(value) => setSection(parseInt(value, 10))}>
              <SelectTrigger id="section">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sectionNumbers.map((num) => (
                    <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">Consequence Type</Label>
            <div className="flex space-x-2">
              <Button type="button" className={`flex-1 py-2 ${type === 'good' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'} rounded-lg font-medium`} onClick={() => setType('good')}>Good</Button>
              <Button type="button" className={`flex-1 py-2 ${type === 'bad' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'} rounded-lg font-medium`} onClick={() => setType('bad')}>Bad</Button>
              <Button type="button" className={`flex-1 py-2 ${type === 'fighting' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'} rounded-lg font-medium`} onClick={() => setType('fighting')}>Fighting</Button>
            </div>
          </div>

          <div>
            <Label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</Label>
            <Input
              id="description"
              type="text"
              placeholder="Enter consequence"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <DialogFooter className="flex space-x-3">
          {consequence?.id ? (
            <Button type="button" variant="destructive" onClick={handleDelete} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium flex-1">
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!text.trim()}
            className={`px-4 py-2 ${type === 'good' ? 'bg-blue-500' : type === 'bad' ? 'bg-gray-800' : 'bg-red-500'} text-white rounded-lg font-medium flex-1`}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
