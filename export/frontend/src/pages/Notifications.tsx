// The Notifications settings and alert feed have moved into the
// Notification Center (bell icon in the top header).
// This route remains reachable but the tab has been removed from the nav.

import { useLocation } from "wouter";
import { useEffect } from "react";

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/"); }, []);
  return null;
}
