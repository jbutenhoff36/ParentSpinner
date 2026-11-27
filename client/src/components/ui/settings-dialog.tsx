import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { AlertCircle, Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { consequenceService } from "@/lib/consequence-service";

interface SettingsDialogProps {
  trigger?: React.ReactNode;
}

export function SettingsDialog({ trigger }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [goodDaysRequired, setGoodDaysRequired] = useState(7);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState("20:00");
  const [wheelColors, setWheelColors] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config } = useQuery<any>({ queryKey: ['/api/config'] });

  useEffect(() => {
    if (config) {
      setGoodDaysRequired(config.goodDaysRequired || 7);
      setNotificationsEnabled(config.notificationsEnabled !== false);
      setNotificationTime(config.notificationTime?.substring(0, 5) || "20:00");
      setWheelColors(config.wheelSettings?.wheelColors || []);
    }
  }, [config]);

  const saveConfigMutation = useMutation({
    mutationFn: (newConfig: any) => consequenceService.saveConfiguration(newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      toast({ title: "Settings saved", description: "Your settings have been updated successfully." });
      setOpen(false);
    },
    onError: () => {
      toast({ title: "Error saving settings", description: "There was a problem saving your settings. Please try again.", variant: "destructive" });
    }
  });

  const handleSaveSettings = () => {
    // The server saves these settings for the logged-in parent's family.
    saveConfigMutation.mutate({
      wheelSettings: { wheelColors },
      goodDaysRequired,
      notificationsEnabled,
      notificationTime: `${notificationTime}:00`,
    });
  };

  const validateGoodDaysRequired = (value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 30) {
      setGoodDaysRequired(numValue);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon" aria-label="Settings">
            <SettingsIcon className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>App Settings</DialogTitle>
          <DialogDescription>Configure your app preferences and notifications.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Good Day Settings</h3>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="goodDaysThreshold" className="text-right col-span-2">Good days required for spin</Label>
              <Input
                id="goodDaysThreshold"
                value={goodDaysRequired}
                onChange={(e) => validateGoodDaysRequired(e.target.value)}
                type="number"
                min={1}
                max={30}
                className="col-span-2"
              />
            </div>
            <p className="text-sm text-muted-foreground pl-1">
              <AlertCircle className="inline w-3 h-3 mr-1" />
              After this many good days, a child earns a good spin.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-medium">Notifications</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications">Daily Reminder</Label>
                <p className="text-sm text-muted-foreground">Receive a daily reminder to record good days</p>
              </div>
              <Switch id="notifications" checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reminderTime" className="text-right">Reminder time</Label>
              <Input
                id="reminderTime"
                type="time"
                value={notificationTime}
                onChange={(e) => setNotificationTime(e.target.value)}
                className="col-span-3"
                disabled={!notificationsEnabled}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveSettings} disabled={saveConfigMutation.isPending}>
            {saveConfigMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
