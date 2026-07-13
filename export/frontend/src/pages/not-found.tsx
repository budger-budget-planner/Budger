import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground mb-6">{t("not_found.title")}</p>
        <Button asChild>
          <Link href="/">{t("not_found.go_home")}</Link>
        </Button>
      </div>
    </div>
  );
}
