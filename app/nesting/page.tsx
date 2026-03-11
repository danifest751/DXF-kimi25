import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { NestingContent } from "@/components/nesting/nesting-content"

export default function NestingPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <NestingContent />
      </SidebarInset>
    </SidebarProvider>
  )
}
