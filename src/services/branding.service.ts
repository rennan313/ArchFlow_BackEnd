import { brandingRepository } from "@/repositories/branding.repository"
import { storageService, type BrandingAssetType } from "@/services/storage/supabase.service"
import type { UpdateBrandingInput } from "@/validations/branding"

export const brandingService = {
  async get(workspaceId: string) {
    const branding = await brandingRepository.findByWorkspace(workspaceId)

    if (!branding) return null

    // Refresh signed URLs if storage paths exist
    const refreshed = await refreshAssetUrls(branding)
    return refreshed
  },

  async update(workspaceId: string, userId: string, input: UpdateBrandingInput) {
    await brandingRepository.upsert(workspaceId, userId, input)
    return this.get(workspaceId)
  },

  async uploadAsset(workspaceId: string, userId: string, assetType: BrandingAssetType, file: File) {
    const result = await storageService.uploadBrandingAsset(userId, assetType, file)

    const fieldMap: Record<BrandingAssetType, {
      urlField:  string
      pathField: string
    }> = {
      "logo":       { urlField: "logoUrl",       pathField: "logoStoragePath" },
      "logo-white": { urlField: "logoWhiteUrl",  pathField: "logoWhiteStoragePath" },
      "favicon":    { urlField: "faviconUrl",    pathField: "faviconStoragePath" },
    }

    const { urlField, pathField } = fieldMap[assetType]

    await brandingRepository.updateAsset(workspaceId, userId, {
      [urlField]:  result.url,
      [pathField]: result.storagePath,
    })

    return { url: result.url, storagePath: result.storagePath, assetType }
  },

  // Called by proposal generation to inject branding context
  async getBrandingContext(workspaceId: string) {
    const branding = await brandingRepository.findByWorkspace(workspaceId)
    if (!branding) return null

    return {
      officeName:        branding.officeName,
      tradeName:         branding.tradeName,
      architectName:     branding.architectName,
      cauNumber:         branding.cauNumber,
      email:             branding.email,
      phone:             branding.phone,
      logoUrl:           branding.logoUrl,
      proposalSignature: branding.proposalSignature,
      proposalFooter:    branding.proposalFooter,
      primaryColor:      branding.primaryColor,
    }
  },
}

async function refreshAssetUrls(branding: Awaited<ReturnType<typeof brandingRepository.findByWorkspace>>) {
  if (!branding) return branding

  const paths: Array<[keyof typeof branding, keyof typeof branding]> = [
    ["logoStoragePath",      "logoUrl"],
    ["logoWhiteStoragePath", "logoWhiteUrl"],
    ["faviconStoragePath",   "faviconUrl"],
  ]

  const updates: Record<string, string> = {}

  await Promise.all(
    paths.map(async ([pathKey, urlKey]) => {
      const storagePath = branding[pathKey] as string | null
      if (!storagePath) return
      try {
        updates[urlKey as string] = await storageService.refreshBrandingUrl(storagePath)
      } catch {
        // Keep existing URL if refresh fails
      }
    }),
  )

  return { ...branding, ...updates }
}
