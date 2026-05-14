import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBanners, useKujis } from "../lib/hooks";
import { useAuthStore } from "../lib/auth-store";
import { apiErrorToKo } from "../lib/error-message";
import { resolveImageUrl } from "../lib/env";

export default function HomeScreen() {
  const authed = useAuthStore((s) => s.authed);
  const hydrated = useAuthStore((s) => s.hydrated);
  const banners = useBanners("HOME");
  const kujis = useKujis();

  if (!hydrated) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-xl font-bold">Lucky Draw</Text>
        <Link
          href={(authed ? "/me" : "/login") as never}
          className="text-sm text-blue-600"
        >
          {authed ? "마이" : "로그인"}
        </Link>
      </View>

      <FlatList
        data={kujis.data ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View className="px-4 py-3">
            <Text className="text-base font-semibold mb-2">진행 중인 배너</Text>
            {banners.isLoading ? (
              <ActivityIndicator />
            ) : banners.data && banners.data.length > 0 ? (
              banners.data.map((b) => (
                <View
                  key={b.id}
                  className="rounded-lg bg-gray-100 px-3 py-2 mb-2"
                >
                  <Text className="text-sm font-medium">{b.title}</Text>
                </View>
              ))
            ) : (
              <Text className="text-sm text-gray-500">배너 없음</Text>
            )}
            <Text className="text-base font-semibold mt-4 mb-2">쿠지 목록</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: "/kujis/[id]", params: { id: item.id } } as never} asChild>
            <Pressable className="px-4 py-3 border-b border-gray-100 active:bg-gray-50 flex-row items-center">
              {(() => {
                const src = resolveImageUrl(item.coverImageUrl);
                return src ? (
                  <Image
                    source={{ uri: src }}
                    className="w-16 h-16 rounded-md bg-gray-100 mr-3"
                  />
                ) : (
                  <View className="w-16 h-16 rounded-md bg-gray-100 mr-3" />
                );
              })()}
              <View className="flex-1">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text className="text-xs text-gray-500 mt-1">
                  {item.pricePerTicket.toLocaleString()}원 · 남은 {item.remainingTickets}/{item.totalTickets}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {item.status}
                </Text>
              </View>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          kujis.isLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator />
            </View>
          ) : kujis.error ? (
            <Text className="text-center text-sm text-red-500 py-6">
              {apiErrorToKo(kujis.error)}
            </Text>
          ) : (
            <Text className="text-center text-sm text-gray-500 py-6">
              진행 중인 쿠지 없음
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}
