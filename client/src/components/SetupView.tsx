import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditConsequenceModal } from "./ui/edit-consequence-modal";
import { PlusIcon, PencilIcon } from "lucide-react";
import { Consequence } from "@shared/schema";

const TYPES = [
  { value: "good", label: "Good", color: "bg-blue-500", tab: "data-[state=active]:border-blue-500 data-[state=active]:text-blue-500", hover: "hover:text-blue-500 hover:border-blue-500" },
  { value: "bad", label: "Bad", color: "bg-gray-800", tab: "data-[state=active]:border-gray-800 data-[state=active]:text-gray-800", hover: "hover:text-gray-800 hover:border-gray-800" },
  { value: "fighting", label: "Fighting", color: "bg-red-500", tab: "data-[state=active]:border-red-500 data-[state=active]:text-red-500", hover: "hover:text-red-500 hover:border-red-500" },
];

export default function SetupView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConsequence, setEditingConsequence] = useState<Consequence | null>(null);
  const [activeTab, setActiveTab] = useState("good");

  const { data: consequences = [], isLoading } = useQuery<Consequence[]>({
    queryKey: ['/api/consequences'],
  });

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingConsequence(null);
  };

  const saveMutation = useMutation({
    mutationFn: async (consequence: Partial<Consequence>) => {
      const body = { text: consequence.text, type: consequence.type, section: consequence.section };
      return consequence.id
        ? apiRequest<Consequence>('PUT', `/api/consequences/${consequence.id}`, body)
        : apiRequest<Consequence>('POST', '/api/consequences', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/consequences'], refetchType: 'all' });
      closeModal();
      toast({ title: "Success", description: "Consequence saved successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save consequence.", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/consequences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/consequences'], refetchType: 'all' });
      closeModal();
      toast({ title: "Success", description: "Consequence deleted successfully!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete consequence.", variant: "destructive" });
    }
  });

  const handleAddNew = () => {
    const sections = new Set(consequences.filter(c => c.type === activeTab).map(c => c.section));
    const maxSections = 20;
    let nextSection = 1;
    while (sections.has(nextSection) && nextSection <= maxSections) {
      nextSection++;
    }
    if (nextSection > maxSections) {
      toast({
        title: "Cannot add more consequences",
        description: `All ${maxSections} sections are already assigned for this type.`,
        variant: "destructive",
      });
      return;
    }
    setEditingConsequence({ id: 0, text: "", type: activeTab, section: nextSection, userId: null });
    setIsModalOpen(true);
  };

  const getConsequencesByType = (type: string) =>
    consequences.filter(c => c.type === type).sort((a, b) => a.section - b.section);

  if (isLoading) {
    return <div className="p-4 text-center">Loading consequences...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Consequence Setup</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 w-full border-b border-gray-200">
          {TYPES.map(t => (
            <TabsTrigger key={t.value} value={t.value} className={`py-2 px-4 data-[state=active]:border-b-2 data-[state=active]:font-bold ${t.tab}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TYPES.map(t => (
          <TabsContent key={t.value} value={t.value} className="space-y-2 mt-0">
            {getConsequencesByType(t.value).map(consequence => (
              <Card key={consequence.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className={`w-6 h-6 ${t.color} text-white rounded-full flex items-center justify-center font-bold text-xs`}>
                    {consequence.section}
                  </span>
                  <span className="font-medium">{consequence.text}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingConsequence(consequence);
                    setIsModalOpen(true);
                  }}
                  aria-label="Edit"
                >
                  <PencilIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </Button>
              </Card>
            ))}
            <Button
              variant="outline"
              onClick={handleAddNew}
              className={`w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 ${t.hover} flex items-center justify-center`}
            >
              <PlusIcon className="mr-2 h-4 w-4" /> Add New Consequence
            </Button>
          </TabsContent>
        ))}
      </Tabs>

      <EditConsequenceModal
        isOpen={isModalOpen}
        onClose={closeModal}
        consequence={editingConsequence}
        onSave={(c: Consequence) => saveMutation.mutate(c)}
        onDelete={(id: number) => deleteMutation.mutate(id)}
      />
    </div>
  );
}
