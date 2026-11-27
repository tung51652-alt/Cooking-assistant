package com.cooklens.config;

import com.cooklens.exception.ApiFailure;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public class OutboundEndpointGuard {
    @FunctionalInterface
    public interface DnsResolver {
        InetAddress[] resolveAll(String host) throws UnknownHostException;
    }

    private final DnsResolver resolver;

    public OutboundEndpointGuard() {
        this(InetAddress::getAllByName);
    }

    public OutboundEndpointGuard(DnsResolver resolver) {
        this.resolver = resolver == null ? InetAddress::getAllByName : resolver;
    }

    public static ApiFailure blockedEndpoint() {
        return new ApiFailure(503, "ASSISTANT_PROVIDER_UNAVAILABLE");
    }

    public static boolean isIpLiteral(String rawHost) {
        if (rawHost == null || rawHost.isBlank()) return false;
        if (rawHost.startsWith("[") && rawHost.endsWith("]")) {
            return parseBracketedIpv6(rawHost) != null;
        }
        return parseCanonicalIpv4(rawHost) != null;
    }

    public static boolean isBlockedHost(String rawHost) {
        if (rawHost == null || rawHost.isBlank()) return true;
        for (int i = 0; i < rawHost.length(); i++) {
            char ch = rawHost.charAt(i);
            if (ch <= 0x20 || ch >= 0x7F || ch == '%') return true;
        }
        if (rawHost.startsWith("[") || rawHost.endsWith("]")) {
            InetAddress ipv6 = parseBracketedIpv6(rawHost);
            return ipv6 == null || !isPublicAddress(ipv6);
        }
        String normalized =
                rawHost.endsWith(".") ? rawHost.substring(0, rawHost.length() - 1) : rawHost;
        if (normalized.isEmpty()
                || normalized.startsWith(".")
                || normalized.endsWith(".")
                || normalized.contains("..")) {
            return true;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        if (lower.equals("localhost")
                || lower.endsWith(".localhost")
                || lower.endsWith(".local")
                || lower.endsWith(".internal")
                || lower.endsWith(".localdomain")
                || lower.endsWith(".arpa")
                || lower.endsWith(".lan")) {
            return true;
        }
        // Reject single-label hostnames (e.g. Docker service names, decimal/hex IP integers).
        if (!lower.contains(".")) {
            return true;
        }
        InetAddress ipv4 = parseCanonicalIpv4(lower);
        if (ipv4 != null) {
            return !isPublicAddress(ipv4);
        }
        // Reject non-canonical numeric IPv4 tricks (octal 0177.0.0.1, hex 0x7f.0.0.1, shorthand
        // 127.1).
        if (looksLikeNumericIpv4Variant(lower)) {
            return true;
        }
        return false;
    }

    public InetAddress resolvePinnedPublicAddress(String rawHost) {
        if (isBlockedHost(rawHost)) {
            throw blockedEndpoint();
        }
        if (rawHost.startsWith("[") && rawHost.endsWith("]")) {
            InetAddress ipv6 = parseBracketedIpv6(rawHost);
            if (ipv6 == null || !isPublicAddress(ipv6)) throw blockedEndpoint();
            return ipv6;
        }
        String dnsHost =
                rawHost.endsWith(".") ? rawHost.substring(0, rawHost.length() - 1) : rawHost;
        InetAddress ipv4 = parseCanonicalIpv4(dnsHost);
        if (ipv4 != null) {
            if (!isPublicAddress(ipv4)) throw blockedEndpoint();
            return ipv4;
        }
        InetAddress[] resolved;
        try {
            resolved = resolver.resolveAll(dnsHost);
        } catch (UnknownHostException | SecurityException e) {
            throw blockedEndpoint();
        }
        if (resolved == null || resolved.length == 0) {
            throw blockedEndpoint();
        }
        for (InetAddress address : resolved) {
            if (!isPublicAddress(address)) {
                throw blockedEndpoint();
            }
        }
        return resolved[0];
    }

    public static boolean isPublicAddress(InetAddress address) {
        if (address == null) return false;
        byte[] raw = address.getAddress();
        if (raw.length == 4) {
            if (address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress()
                    || address.isMulticastAddress()) {
                return false;
            }
            return isPublicIpv4(raw[0], raw[1], raw[2], raw[3]);
        }
        if (raw.length == 16) {
            // Unpack IPv4-mapped IPv6 (::ffff:0:0/96) and validate the embedded IPv4 address.
            if (isIpv4MappedIpv6(raw)) {
                return isPublicIpv4(raw[12], raw[13], raw[14], raw[15]);
            }
            if (address.isAnyLocalAddress()
                    || address.isLoopbackAddress()
                    || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress()
                    || address.isMulticastAddress()) {
                return false;
            }
            return isPublicIpv6(raw);
        }
        return false;
    }

    public static boolean isPublicIpv4(byte a, byte b, byte c, byte d) {
        int b0 = a & 0xFF;
        int b1 = b & 0xFF;
        int b2 = c & 0xFF;
        // 0.0.0.0/8 (unspecified / current network)
        if (b0 == 0) return false;
        // 10.0.0.0/8 (RFC 1918 private)
        if (b0 == 10) return false;
        // 100.64.0.0/10 (RFC 6598 carrier-grade NAT)
        if (b0 == 100 && (b1 & 0xC0) == 64) return false;
        // 127.0.0.0/8 (loopback)
        if (b0 == 127) return false;
        // 169.254.0.0/16 (link-local / cloud metadata)
        if (b0 == 169 && b1 == 254) return false;
        // 172.16.0.0/12 (RFC 1918 private)
        if (b0 == 172 && (b1 & 0xF0) == 16) return false;
        // 192.0.0.0/24 (IETF protocol assignments)
        if (b0 == 192 && b1 == 0 && b2 == 0) return false;
        // 192.0.2.0/24 (TEST-NET-1 documentation)
        if (b0 == 192 && b1 == 0 && b2 == 2) return false;
        // 192.88.99.0/24 (deprecated 6to4 relay anycast)
        if (b0 == 192 && b1 == 88 && b2 == 99) return false;
        // 192.168.0.0/16 (RFC 1918 private)
        if (b0 == 192 && b1 == 168) return false;
        // 198.18.0.0/15 (RFC 2544 benchmarking)
        if (b0 == 198 && (b1 == 18 || b1 == 19)) return false;
        // 198.51.100.0/24 (TEST-NET-2 documentation)
        if (b0 == 198 && b1 == 51 && b2 == 100) return false;
        // 203.0.113.0/24 (TEST-NET-3 documentation)
        if (b0 == 203 && b1 == 0 && b2 == 113) return false;
        // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved + broadcast 255.255.255.255)
        if (b0 >= 224) return false;
        return true;
    }

    private static boolean isPublicIpv6(byte[] raw) {
        int b0 = raw[0] & 0xFF;
        int b1 = raw[1] & 0xFF;
        int b2 = raw[2] & 0xFF;
        int b3 = raw[3] & 0xFF;
        int b4 = raw[4] & 0xFF;
        int b5 = raw[5] & 0xFF;

        // ::/96 (unspecified, loopback, deprecated IPv4-compatible)
        if (allZero(raw, 0, 12)) return false;
        // ::ffff:0:0:0/96 (IPv4-translated SIIT)
        if (allZero(raw, 0, 8)
                && (raw[8] & 0xFF) == 0xFF
                && (raw[9] & 0xFF) == 0xFF
                && raw[10] == 0
                && raw[11] == 0) {
            return false;
        }
        // 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64)
        if (b0 == 0x00 && b1 == 0x64 && b2 == 0xFF && b3 == 0x9B) return false;
        // 100::/64 (RFC 6666 discard-only)
        if (b0 == 0x01 && b1 == 0x00 && allZero(raw, 2, 8)) return false;
        // fc00::/7 (ULA)
        if ((b0 & 0xFE) == 0xFC) return false;
        // fe80::/10 (link-local) and fec0::/10 (deprecated site-local)
        if (b0 == 0xFE && ((b1 & 0xC0) == 0x80 || (b1 & 0xC0) == 0xC0)) return false;
        // ff00::/8 (multicast)
        if (b0 == 0xFF) return false;

        // Only IANA Global Unicast (2000::/3) is globally routable.
        if ((b0 & 0xE0) != 0x20) return false;

        // 2001:db8::/32 (documentation)
        if (b0 == 0x20 && b1 == 0x01 && b2 == 0x0D && b3 == 0xB8) return false;
        // 2001:0000::/32 (Teredo)
        if (b0 == 0x20 && b1 == 0x01 && b2 == 0x00 && b3 == 0x00) return false;
        // 2001:0002::/48 (benchmarking)
        if (b0 == 0x20 && b1 == 0x01 && b2 == 0x00 && b3 == 0x02 && b4 == 0x00 && b5 == 0x00)
            return false;
        // 2001:0010::/28 (ORCHID) and 2001:0020::/28 (ORCHIDv2)
        if (b0 == 0x20 && b1 == 0x01 && b2 == 0x00 && ((b3 & 0xF0) == 0x10 || (b3 & 0xF0) == 0x20))
            return false;
        // 2002::/16 (6to4 embeds arbitrary IPv4)
        if (b0 == 0x20 && b1 == 0x02) return false;

        return true;
    }

    private static boolean isIpv4MappedIpv6(byte[] raw) {
        return raw.length == 16
                && allZero(raw, 0, 10)
                && (raw[10] & 0xFF) == 0xFF
                && (raw[11] & 0xFF) == 0xFF;
    }

    private static boolean allZero(byte[] raw, int fromInclusive, int toExclusive) {
        for (int i = fromInclusive; i < toExclusive; i++) {
            if (raw[i] != 0) return false;
        }
        return true;
    }

    private static InetAddress parseBracketedIpv6(String rawHost) {
        if (!rawHost.startsWith("[") || !rawHost.endsWith("]") || rawHost.length() < 4) return null;
        String inner = rawHost.substring(1, rawHost.length() - 1);
        if (!inner.contains(":")) return null;
        for (int i = 0; i < inner.length(); i++) {
            char ch = inner.charAt(i);
            boolean hex =
                    (ch >= '0' && ch <= '9')
                            || (ch >= 'a' && ch <= 'f')
                            || (ch >= 'A' && ch <= 'F');
            if (!hex && ch != ':' && ch != '.') return null;
        }
        try {
            // Because inner contains ':' and only IPv6 literal characters, InetAddress parses it
            // locally without DNS.
            return InetAddress.getByName(inner);
        } catch (UnknownHostException e) {
            return null;
        }
    }

    private static InetAddress parseCanonicalIpv4(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return null;
        byte[] bytes = new byte[4];
        for (int i = 0; i < 4; i++) {
            String part = parts[i];
            if (part.isEmpty() || part.length() > 3) return null;
            if (part.length() > 1 && part.charAt(0) == '0') return null;
            int value = 0;
            for (int j = 0; j < part.length(); j++) {
                char ch = part.charAt(j);
                if (ch < '0' || ch > '9') return null;
                value = value * 10 + (ch - '0');
            }
            if (value > 255) return null;
            bytes[i] = (byte) value;
        }
        try {
            return InetAddress.getByAddress(bytes);
        } catch (UnknownHostException e) {
            return null;
        }
    }

    private static boolean looksLikeNumericIpv4Variant(String host) {
        String[] parts = host.split("\\.", -1);
        if (parts.length < 2 || parts.length > 4) return false;
        for (String part : parts) {
            if (part.isEmpty()) return true;
            if (part.startsWith("0x") || part.startsWith("0X")) {
                if (part.length() == 2) return true;
                for (int i = 2; i < part.length(); i++) {
                    char ch = part.charAt(i);
                    boolean hex =
                            (ch >= '0' && ch <= '9')
                                    || (ch >= 'a' && ch <= 'f')
                                    || (ch >= 'A' && ch <= 'F');
                    if (!hex) return false;
                }
            } else {
                for (int i = 0; i < part.length(); i++) {
                    char ch = part.charAt(i);
                    if (ch < '0' || ch > '9') return false;
                }
            }
        }
        return true;
    }
}
