import { Stack, Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShipments } from "../../lib/hooks";
import { SHIPMENT_STATUS_LABEL, formatDate } from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

export default function ShipmentsListScreen() {
  const shipments = useShipments();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{ headerShown: true, title: "내 배송", headerBackTitle: "뒤로" }}
      />
      <FlatList
        data={shipments.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <Link
            href={{ pathname: "/shipments/[id]", params: { id: item.id } } as never}
            asChild
          >
            <Pressable className="px-4 py-3 border-b border-gray-100 active:bg-gray-50">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-sm font-medium">
                  {SHIPMENT_STATUS_LABEL[item.status] ?? item.status}
                </Text>
                <Text className="text-xs text-gray-500">
                  {formatDate(item.createdAt)}
                </Text>
              </View>
              {item.carrier && item.trackingNumber && (
                <Text className="text-xs text-gray-500">
                  {item.carrier} · {item.trackingNumber}
                </Text>
              )}
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          shipments.isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : shipments.error ? (
            <Text className="text-center text-sm text-red-500 py-10">
              {apiErrorToKo(shipments.error)}
            </Text>
          ) : (
            <Text className="text-center text-sm text-gray-500 py-10">
              배송 내역이 없습니다.
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}
