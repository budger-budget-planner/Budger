import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useAcceptInvite,
  useGetMe,
  getGetMeQueryKey,
  getGetHouseholdQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Check, AlertTriangle, Ban, LogIn } from "lucide-react";
import BadgerLogo from "@/components/BadgerLogo";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

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
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    enabled: !!token,
    retry: false,
  });

  const isRevoked = isError && (error as any)?.revoked === true;
  const { data: me } = useGetMe();

  const accept = useAcceptInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetHouseholdQueryKey() });
        setLocation("/household");
      },
    },
  });

  function handleGoToLogin() {
    // Save invite token so user can return after login
    sessionStorage.setItem("budger_pending_invite", token ?? "");
    setLocation("/login");
  }

  function handleAccept() {
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
            <h2 className="font-semibold mb-2">{t("invite.revoked")}</h2>
            <p className="text-sm text-muted-foreground">{t("invite.revoked_msg")}</p>
            <Button className="mt-6" onClick={() => setLocation("/")}>{t("invite.go_to_app")}</Button>
          </div>
        ) : isError || !invite ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="font-semibold mb-2">{t("invite.not_found")}</h2>
            <p className="text-sm text-muted-foreground">{t("invite.expired_msg")}</p>
            <Button className="mt-6" onClick={() => setLocation("/")}>{t("invite.go_to_app")}</Button>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-2xl p-8 shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-center mb-1">{t("invite.youre_invited")}</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {t("invite.join_msg", { name: invite.householdName })}
            </p>

            {!me ? (
              <div className="space-y-3 mb-6 border-t border-border pt-5">
                <p className="text-xs text-muted-foreground text-center">{t("invite.create_or_signin")}</p>
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={handleGoToLogin}
                >
                  <LogIn className="w-4 h-4" />
                  {t("invite.go_to_login")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-muted">
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{me.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{me.name}</p>
                    <p className="text-xs text-muted-foreground">{me.email}</p>
                  </div>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleAccept}
                  disabled={accept.isPending}
                  data-testid="button-accept-invite"
                >
                  <Check className="w-4 h-4" />
                  {accept.isPending ? t("invite.joining") : t("invite.join_btn", { name: invite.householdName })}
                </Button>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center mt-4">
              {t("invite.expires", { date: new Date(invite.expiresAt).toLocaleDateString() })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
