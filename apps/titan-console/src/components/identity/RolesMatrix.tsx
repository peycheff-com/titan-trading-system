import { useAuth } from '@/context/AuthContext';
import {
  OperatorRole,
  buildPermissionMatrix,
  OperatorIntentType,
  DANGER_LEVEL,
} from '@titan/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const RolesMatrix = () => {
  const { roles } = useAuth();
  const matrix = buildPermissionMatrix();

  const isUserRole = (role: OperatorRole) => roles.includes(role);

  const getDangerColor = (type: OperatorIntentType) => {
    const level = DANGER_LEVEL[type];
    if (level === 'critical') return 'text-red-500';
    if (level === 'high') return 'text-orange-500';
    return 'text-green-500';
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Your current roles are highlighted. Roles grant permission to execute specific intent types.
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Role</TableHead>
              <TableHead>Permissions (Allowed Intents)</TableHead>
              <TableHead className="w-[100px] text-center">Approver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((row) => (
              <TableRow
                key={row.role}
                className={cn(isUserRole(row.role) && "bg-muted/50 font-medium")}
              >
                <TableCell className="font-semibold capitalize">
                  <div className="flex items-center gap-2">
                    {row.role.replace('_', ' ')}
                    {isUserRole(row.role) && (
                      <Badge variant="secondary" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {row.allowed_intents.map((intent) => (
                      <Badge
                        key={intent}
                        variant="outline"
                        className={cn("text-xs capitalize", getDangerColor(intent))}
                      >
                        {intent.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {row.can_approve ? (
                    <div className="flex justify-center text-emerald-500">
                      <Check className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex justify-center text-muted-foreground/30">
                      <X className="h-4 w-4" />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
