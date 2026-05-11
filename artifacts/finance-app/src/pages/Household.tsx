import { useState } from "react";
import {
  useGetHousehold,
  useListHouseholdMembers,
  useListInvites,
  useCreateHousehold,
  useCreateInvite,
  useCancelInvite,
  useRemoveHouseholdMember,
  useLeaveHousehold,
  useGetMe,
  getGetHouseholdQueryKey,
  getListHouseholdMembersQueryKey,
  getListInvitesQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Mail, X, LogOut, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function invalidateHousehold(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
  qc.invalidateQueries({ queryKey: getListHouseholdMembersQueryKey() });
  qc.invalidateQueries({ queryKey: getListInvitesQueryKey() });
  qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
}

export default function HouseholdPage() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const { data: household, isLoading: householdLoading } = useGetHousehold();
  const { data: members } = useListHouseholdMembers();
  const { data: invites } = useListInvites();

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const createHousehold = useCreateHousehold({ mutation: { onSuccess: () => { invalidateHousehold(queryClient); setCreateOpen(false); } } });
  const createInvite = useCreateInvite({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() }); setInviteOpen(false); setInviteEmail(""); } } });
  const cancelInvite = useCancelInvite({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInvitesQueryKey() }) } });
  const removeMember = useRemoveHouseholdMember({ mutation: { onSuccess: () => invalidateHousehold(queryClient) } });
  const leaveHousehold = useLeaveHousehold({ mutation: { onSuccess: () => invalidateHousehold(queryClient) } });

  function copyInviteLink(token: string) {
    const base = window.location.origin + import.meta.env.BASE_URL;
    navigator.clipboard.writeText(`${base}invite/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  if (householdLoading) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Household</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Share expenses with your household members</p>
        </div>
      </div>

      {!household ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="font-semibold mb-2">No household yet</h2>
          <p className="text-muted-foreground text-sm mb-6">Create a household to track spending together with family or roommates.</p>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-household" className="gap-2">
            <Plus className="w-4 h-4" /> Create Household
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Household info */}
          <div className="bg-card border border-card-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-lg" data-testid="text-household-name">{household.name}</h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => { if (confirm("Leave this household?")) leaveHousehold.mutate(); }}
                data-testid="button-leave-household"
              >
                <LogOut className="w-3.5 h-3.5" /> Leave
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Created {new Date(household.createdAt).toLocaleDateString()}</p>
          </div>

          {/* Members */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-medium text-sm">Members ({members?.length ?? 0})</h3>
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} data-testid="button-invite-member" className="gap-1.5 h-7">
                <Mail className="w-3.5 h-3.5" /> Invite
              </Button>
            </div>
            <div className="divide-y divide-border">
              {members?.map(m => (
                <div key={m.userId} data-testid={`row-member-${m.userId}`} className="flex items-center gap-3 px-5 py-3 group">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{m.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name} {m.userId === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{m.role}</span>
                  {m.userId !== me?.id && household.ownerId === me?.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Remove ${m.name}?`)) removeMember.mutate({ userId: m.userId }); }}
                      data-testid={`button-remove-member-${m.userId}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pending invites */}
          {invites && invites.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-medium text-sm">Pending Invites ({invites.length})</h3>
              </div>
              <div className="divide-y divide-border">
                {invites.map(inv => (
                  <div key={inv.id} data-testid={`row-invite-${inv.id}`} className="flex items-center gap-3 px-5 py-3 group">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      onClick={() => copyInviteLink(inv.token)}
                      data-testid={`button-copy-invite-${inv.id}`}
                      title="Copy invite link"
                    >
                      {copied === inv.token ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={() => cancelInvite.mutate({ token: inv.token })}
                      data-testid={`button-cancel-invite-${inv.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create household dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Household</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!householdName.trim()) return; createHousehold.mutate({ data: { name: householdName.trim() } }); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Household name</Label>
              <Input data-testid="input-household-name" placeholder="The Johnsons, Apt 4B..." value={householdName} onChange={e => setHouseholdName(e.target.value)} required autoFocus />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createHousehold.isPending} data-testid="button-save-household">
                {createHousehold.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Invite to Household</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!inviteEmail.trim()) return; createInvite.mutate({ data: { email: inviteEmail.trim() } }); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email address</Label>
              <Input data-testid="input-invite-email" type="email" placeholder="friend@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required autoFocus />
              <p className="text-xs text-muted-foreground">They'll receive a link to join your household.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createInvite.isPending} data-testid="button-send-invite">
                {createInvite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
