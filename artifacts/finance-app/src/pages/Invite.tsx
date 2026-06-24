import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useAcceptInvite,
  useGetMe,
  useLogin,
  getGetMeQueryKey,
  getGetHouseholdQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Check, AlertTriangle, Ban } from "lucide-react";
import BadgerLogo from "@/components/BadgerLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: invite, isLoading: inviteLoading, isError, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/invites/${token}`, {
        credentials: "include",
      });
      if (r.status === 410) {
        const err = new Error("revoked") as any;
        err.revoked = true;
        throw err;
      }
      if (!r.ok) {
        throw new Error("not_found");
      }
      return r.json();
    },
    enabled: !!token,
    retry: false,
  });

  const isRevoked = isError && (error as any)?.revoked === true;

  const { data: me } = useGetMe();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const login = useLogin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
    },
  });

  const accept = useAcceptInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
        setLocation("/household");
      },
    },
  });

  async function handleAccept() {
    if (!me) {
      if (!name.trim() || !email.trim()) return;
      await login.mutateAsync({ data: { name: name.trim(), email: email.trim() } });
    }
    accept.mutate({ token });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <BadgerLogo size={36} />
          <span className="text-xl font-bold tracking-tight">Budger</span>
        </div>

        {inviteLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : isRevoked ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Ban className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="font-semibold mb-2">Invite revoked</h2>
            <p className="text-sm text-muted-foreground">This invite link has been cancelled by the household owner.</p>
            <Button className="mt-6" onClick={() => setLocation("/")}>Go to App</Button>
          </div>
        ) : isError || !invite ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="font-semibold mb-2">Invite not found</h2>
            <p className="text-sm text-muted-foreground">This invite link may be expired or invalid.</p>
            <Button className="mt-6" onClick={() => setLocation("/")}>Go to App</Button>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-2xl p-8 shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-center mb-1">You're invited!</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Join <span className="font-semibold text-foreground">{invite.householdName}</span> on Budger to track household spending together.
            </p>

            {!me && (
              <div className="space-y-4 mb-6 border-t border-border pt-5">
                <p className="text-xs text-muted-foreground text-center">Create an account or sign in to accept</p>
                <div className="space-y-1.5">
                  <Label>Your name</Label>
                  <Input data-testid="input-name" placeholder="Alex Johnson" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input data-testid="input-email" type="email" placeholder={invite.email} value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
            )}

            {me && (
              <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-muted">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{me.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{me.name}</p>
                  <p className="text-xs text-muted-foreground">{me.email}</p>
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleAccept}
              disabled={accept.isPending || login.isPending || (!me && (!name.trim() || !email.trim()))}
              data-testid="button-accept-invite"
            >
              <Check className="w-4 h-4" />
              {accept.isPending ? "Joining..." : `Join ${invite.householdName}`}
            </Button>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
