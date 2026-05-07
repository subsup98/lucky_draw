import { useLocalSearchParams, Stack } from "expo-router";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useKujiDetail } from "../../lib/hooks";
import { apiErrorToKo } from "../../lib/error-message";

export default function KujiDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useKujiDetail(id);

  if (detail.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Stack.Screen options={{ headerShown: true, title: "쿠지", headerBackTitle: "뒤로" }} />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Stack.Screen options={{ headerShown: true, title: "쿠지", headerBackTitle: "뒤로" }} />
        <Text className="text-sm text-red-500">
          {apiErrorToKo(detail.error)}
        </Text>
      </SafeAreaView>
    );
  }

  const k = detail.data;
  const remaining = k.totalTickets - k.soldTickets;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{ headerShown: true, title: k.title, headerBackTitle: "뒤로" }}
      />
      <ScrollView className="flex-1">
        {k.coverImageUrl ? (
          <Image
            source={{ uri: k.coverImageUrl }}
            className="w-full h-56 bg-gray-100"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-56 bg-gray-100" />
        )}

        <View className="px-6 py-5">
          <Text className="text-xl font-bold mb-1">{k.title}</Text>
          <Text className="text-sm text-gray-500 mb-4">{k.status}</Text>

          <View className="flex-row justify-between mb-4 border-y border-gray-100 py-3">
            <View>
              <Text className="text-xs text-gray-500">티켓 가격</Text>
              <Text className="text-base font-semibold mt-1">
                {k.pricePerTicket.toLocaleString()}원
              </Text>
            </View>
            <View>
              <Text className="text-xs text-gray-500">남은 수량</Text>
              <Text className="text-base font-semibold mt-1">
                {remaining} / {k.totalTickets}
              </Text>
            </View>
          </View>

          {k.description && (
            <Text className="text-sm text-gray-700 leading-5 mb-6">
              {k.description}
            </Text>
          )}

          <Text className="text-base font-semibold mb-3">상품 라인업</Text>
          {k.prizeTiers.map((tier) => (
            <View
              key={tier.id}
              className="border border-gray-200 rounded-md p-3 mb-3"
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-sm font-semibold">
                  {tier.rank} · {tier.name}
                </Text>
                {tier.inventory && (
                  <Text className="text-xs text-gray-500">
                    {tier.inventory.remainingQuantity} /{" "}
                    {tier.inventory.totalQuantity}
                  </Text>
                )}
              </View>
              {tier.prizeItems.length > 0 && (
                <View>
                  {tier.prizeItems.map((item) => (
                    <Text
                      key={item.id}
                      className="text-xs text-gray-600"
                    >
                      · {item.name}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
