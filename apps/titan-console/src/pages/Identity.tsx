import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionsPanel } from "@/components/identity/SessionsPanel";
import { RolesMatrix } from "@/components/identity/RolesMatrix";
import { ApprovalsQueue } from "@/components/identity/ApprovalsQueue";

export default function Identity() {
  return (
    <div className="container mx-auto py-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Identity & Authority</h2>
          <p className="text-muted-foreground mt-2">
            Manage your session, view permissions, and process pending intent approvals.
          </p>
        </div>
      </div>
      
      <Tabs defaultValue="approvals" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="approvals">Approvals Queue</TabsTrigger>
          <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="approvals" className="space-y-4 focus-visible:outline-none">
           <div className="bg-card border rounded-lg p-6 shadow-sm">
             <div className="mb-4">
                <h3 className="text-lg font-medium">Pending Approvals</h3>
                <p className="text-sm text-muted-foreground">
                  Intents requiring authorization from your role capability.
                </p>
             </div>
             <ApprovalsQueue />
           </div>
        </TabsContent>
        
        <TabsContent value="roles" className="space-y-4 focus-visible:outline-none">
           <div className="bg-card border rounded-lg p-6 shadow-sm">
             <div className="mb-4">
                <h3 className="text-lg font-medium">Permission Matrix</h3>
                <p className="text-sm text-muted-foreground">
                  Overview of role capabilities and danger levels.
                </p>
             </div>
             <RolesMatrix />
           </div>
        </TabsContent>
        
        <TabsContent value="sessions" className="space-y-4 focus-visible:outline-none">
           <div className="bg-card border rounded-lg p-6 shadow-sm">
             <div className="mb-4">
                <h3 className="text-lg font-medium">Session Management</h3>
                <p className="text-sm text-muted-foreground">
                  Review active sessions and device history.
                </p>
             </div>
             <SessionsPanel />
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
