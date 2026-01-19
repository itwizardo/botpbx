'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Edit, Trash2, Phone, Key, Eye, RefreshCw, Copy, Check, Server, Plug, HelpCircle, QrCode, Smartphone } from 'lucide-react';
import { extensionsApi, SipDetails } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExtensionDialog } from '@/components/extensions/extension-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { toast } from 'sonner';
import type { Extension } from '@/types/models';

// Copy function that works in HTTP contexts and inside dialogs
const copyTextToClipboard = (text: string): boolean => {
  // Create a temporary input element
  const input = document.createElement('input');
  input.style.position = 'absolute';
  input.style.left = '0';
  input.style.top = '0';
  input.style.opacity = '0.01';
  input.style.pointerEvents = 'none';
  input.style.zIndex = '99999';
  input.value = text;

  // Append to dialog if open, otherwise body - this bypasses focus trapping
  const dialogContent = document.querySelector('[role="dialog"]') || document.body;
  dialogContent.appendChild(input);

  // Select and copy
  input.focus();
  input.select();
  input.setSelectionRange(0, text.length);

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (e) {
    console.error('Copy failed:', e);
  }

  // Clean up
  dialogContent.removeChild(input);

  return success;
};

function SipDetailsDialog({
  open,
  onOpenChange,
  extension,
  sipDetails,
  onRegenerate,
  isRegenerating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extension: Extension | null;
  sipDetails: SipDetails | null;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  if (!extension || !sipDetails) return null;

  // Generate QR content - human-readable format for any QR scanner
  const qrContent = `SIP Account: ${extension.name}
Server: ${sipDetails.server}
Port: ${sipDetails.port}
Username: ${sipDetails.username}
Password: ${sipDetails.password}
Transport: UDP`;

  const copyToClipboard = (text: string, field: string) => {
    const success = copyTextToClipboard(text);
    if (success) {
      setCopied(field);
      toast.success(`${field} copied to clipboard`);
      setTimeout(() => setCopied(null), 2000);
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  const copyAll = () => {
    const allDetails = `Server: ${sipDetails.server}
Port: ${sipDetails.port}
Username: ${sipDetails.username}
Password: ${sipDetails.password}`;
    const success = copyTextToClipboard(allDetails);
    if (success) {
      toast.success('All SIP details copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>SIP Details - {extension.name}</DialogTitle>
          <DialogDescription>
            Extension {extension.number} credentials for SIP client configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 mb-4">
          <div className="text-sm text-muted-foreground">Name: <span className="font-medium text-foreground">{extension.name}</span></div>
          <div className="text-sm text-muted-foreground">Extension: <span className="font-mono font-medium text-foreground">{extension.number}</span></div>
        </div>

        <div className="text-sm font-medium mb-2">SIP Login Details:</div>
        <div className="bg-muted/50 rounded-md border p-3 space-y-2 font-mono text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Server:</span>
              <span>{sipDetails.server}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => copyToClipboard(sipDetails.server, 'Server')}
            >
              {copied === 'Server' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Username:</span>
              <span>{sipDetails.username}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => copyToClipboard(sipDetails.username, 'Username')}
            >
              {copied === 'Username' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Password:</span>
              <span className="text-green-600 dark:text-green-400">{sipDetails.password}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => copyToClipboard(sipDetails.password, 'Password')}
            >
              {copied === 'Password' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Port:</span>
              <span>{sipDetails.port}</span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => copyToClipboard(String(sipDetails.port), 'Port')}
            >
              {copied === 'Port' ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {/* SIP Details QR Code Section */}
        <div className="border-t pt-4 mt-4">
          <Button
            variant="outline"
            onClick={() => setShowQR(!showQR)}
            className="w-full flex items-center justify-center gap-2"
          >
            <QrCode className="h-4 w-4" />
            {showQR ? 'Hide QR Code' : 'Show QR Code'}
          </Button>

          {showQR && (
            <div className="mt-4 p-4 bg-white rounded-lg flex flex-col items-center">
              <QRCodeSVG
                value={qrContent}
                size={200}
                level="M"
                includeMargin={true}
              />
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Scan with any QR reader to view SIP credentials
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Then manually enter in your SIP phone app
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={copyAll} className="flex-1 sm:flex-none">
            <Copy className="h-4 w-4 mr-2" />
            Copy All
          </Button>
          <Button
            variant="outline"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
            {isRegenerating ? 'Regenerating...' : 'New Password'}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExtensionsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [extensionToDelete, setExtensionToDelete] = useState<Extension | null>(null);
  const [sipDialogOpen, setSipDialogOpen] = useState(false);
  const [sipDetailsExt, setSipDetailsExt] = useState<Extension | null>(null);
  const [currentSipDetails, setCurrentSipDetails] = useState<SipDetails | null>(null);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: extensionsApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => extensionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      toast.success('Extension deleted successfully');
      setDeleteDialogOpen(false);
      setExtensionToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete extension');
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (number: string) => extensionsApi.regeneratePassword(number),
    onSuccess: (data) => {
      setCurrentSipDetails(data.sipDetails);
      toast.success('Password regenerated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to regenerate password');
    },
  });

  const handleCreate = () => {
    setSelectedExtension(null);
    setDialogOpen(true);
  };

  const handleEdit = (extension: Extension) => {
    setSelectedExtension(extension);
    setDialogOpen(true);
  };

  const handleDeleteClick = (extension: Extension) => {
    setExtensionToDelete(extension);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (extensionToDelete) {
      deleteMutation.mutate(extensionToDelete.number);
    }
  };

  const handleViewSipDetails = async (extension: Extension) => {
    try {
      const data = await extensionsApi.getSipDetails(extension.number);
      setSipDetailsExt(extension);
      setCurrentSipDetails(data.sipDetails);
      setSipDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load SIP details');
    }
  };

  const handleRegenerate = () => {
    if (sipDetailsExt) {
      regenerateMutation.mutate(sipDetailsExt.number);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extensions</h1>
          <p className="text-muted-foreground">Manage SIP extensions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHelpDialogOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-2" />
            Help
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Extension
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Extensions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : data?.extensions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No extensions configured</p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first extension
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Extension</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data?.extensions.map((ext) => (
                    <tr key={ext.number} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono font-medium">{ext.number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{ext.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={ext.enabled ? 'success' : 'secondary'}>
                          {ext.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewSipDetails(ext)}
                            title="View SIP Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(ext)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => handleDeleteClick(ext)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExtensionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        extension={selectedExtension}
      />

      <SipDetailsDialog
        open={sipDialogOpen}
        onOpenChange={setSipDialogOpen}
        extension={sipDetailsExt}
        sipDetails={currentSipDetails}
        onRegenerate={handleRegenerate}
        isRegenerating={regenerateMutation.isPending}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Extension"
        description={`Are you sure you want to delete extension ${extensionToDelete?.number}? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />

      {/* Help Dialog */}
      <Dialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extensions Help</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">What are Extensions?</h4>
              <p className="text-sm text-muted-foreground">
                Extensions are SIP endpoints that allow users to make and receive calls. Each extension has a unique number and SIP credentials.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Connecting a SIP Phone</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li><strong>Server:</strong> Your server's IP address or hostname</li>
                <li><strong>Port:</strong> Usually 5060 (UDP) or 5061 (TLS)</li>
                <li><strong>Username:</strong> The extension number (e.g., 1001)</li>
                <li><strong>Password:</strong> Click "View SIP Details" to see</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Security Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Use strong, unique passwords for each extension</li>
                <li>Click the key icon to regenerate a password if compromised</li>
                <li>Limit registration to known IP addresses when possible</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
