import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { ViewerContent } from "@/components/viewer/viewer-content"

export default function ViewerPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <ViewerContent />
      </SidebarInset>
    </SidebarProvider>
  )
}
