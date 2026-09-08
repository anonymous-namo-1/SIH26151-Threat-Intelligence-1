import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Shield, User, Globe, FileText, MapPin, Cpu, Link, Server, Hash, Key, Wallet, Phone, MessageSquare, AtSign, Mail, Store, Building, AlertTriangle } from 'lucide-react';
import { EntityType, Entity } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

function getIconForType(type: string) {
  switch (type) {
    case 'PERSONA': return User;
    case 'ACTOR_HYPOTHESIS': return Shield;
    case 'DOMAIN':
    case 'URL':
    case 'IP_ADDRESS':
    case 'ONION_SERVICE': return Globe;
    case 'DOCUMENT':
    case 'POST': return FileText;
    case 'LOCATION_INDICATOR': return MapPin;
    case 'DEVICE_INDICATOR': return Cpu;
    case 'FILE_HASH': return Hash;
    case 'PGP_KEY': return Key;
    case 'CRYPTO_WALLET':
    case 'CRYPTO_TRANSACTION': return Wallet;
    case 'USERNAME': return AtSign;
    case 'EMAIL': return Mail;
    case 'MESSAGE': return MessageSquare;
    case 'MARKETPLACE':
    case 'FORUM': return Store;
    case 'ORGANIZATION': return Building;
    case 'INFRASTRUCTURE': return Server;
    default: return Link;
  }
}

export const EntityNode = memo(({ data, selected }: { data: { entity: Entity }, selected?: boolean }) => {
  const Icon = getIconForType(data.entity.type);
  const confidence = data.entity.confidence;
  
  let confidenceColor = "bg-primary";
  if (confidence < 0.4) confidenceColor = "bg-destructive";
  else if (confidence < 0.7) confidenceColor = "bg-warning";

  return (
    <div className={cn(
      "px-4 py-3 rounded-lg shadow-sm border bg-card text-card-foreground flex items-center gap-3 min-w-[200px] transition-all",
      selected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"
    )}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 opacity-0" />
      <div className={cn("p-2 rounded-md bg-muted text-muted-foreground", selected && "text-primary bg-primary/10")}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold tracking-wider text-muted-foreground mb-1 uppercase">
          {data.entity.type.replace('_', ' ')}
        </div>
        <div className="font-medium text-sm truncate" title={data.entity.value}>
          {data.entity.value}
        </div>
      </div>
      <div className="flex flex-col items-end justify-center gap-1">
        {data.entity.confidence < 0.5 && <AlertTriangle className="w-3 h-3 text-destructive" />}
        <div className="flex items-center gap-1">
          <div className={cn("w-1.5 h-1.5 rounded-full", confidenceColor)} />
          <span className="text-[10px] text-muted-foreground font-mono">{Math.round(confidence * 100)}%</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 opacity-0" />
    </div>
  );
});

EntityNode.displayName = 'EntityNode';
