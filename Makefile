#
# Copyright (C) 2026 WarpScout LuCI App Authors
#
# This is free software, licensed under the MIT License.
#

include $(TOPDIR)/rules.mk

PKG_VERSION:=0.1.1
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for warpscout Cloudflare WARP scanner and wrapper
LUCI_DEPENDS:=+luci-base +ucode +ucode-mod-uci +ucode-mod-fs +rpcd-mod-ucode +jsonfilter
LUCI_PKGARCH:=all

PKG_LICENSE:=MIT
PKG_MAINTAINER:=WarpScout Team

define Package/$(PKG_NAME)/conffiles
/etc/config/warpscout
/etc/warpscout/account.json
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
