import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShipment } from "../../lib/hooks";
import { SHIPMENT_STATUS_LABEL, formatDate } from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

export default function ShipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shipment = useShipment(id);

  if (shipment.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Stack.Screen
          options={{ headerShown: true, title: "배송 상세", headerBackTitle: "뒤로" }}
        />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (shipment.error || !shipment.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Stack.Screen
          options={{ headerShown: true, title: "배송 상세", headerBackTitle: "뒤로" }}
        />
        <Text className="text-sm text-red-500">
          {apiErrorToKo(shipment.error)}
        </Text>
      </SafeAreaView>
    );
  }

  const s = shipment.data;
  const recipient =
    typeof s.recipient === "string" ? s.recipient : null;
  const phone = typeof s.phone === "string" ? s.phone : null;
  const address = [s.postalCode, s.addressLine1, s.addressLine2]
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" ");

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{ headerShown: true, title: "배송 상세", headerBackTitle: "뒤로" }}
      />
      <ScrollView className="flex-1 px-6 py-4">
        <View className="mb-4">
          <Text className="text-xs text-gray-500">배송 상태</Text>
          <Text className="text-lg font-semibold mt-1">
            {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
          </Text>
        </View>

        {(s.carrier || s.trackingNumber) && (
          <View className="border-y border-gray-100 py-3 mb-4">
            {s.carrier && <Row label="택배사" value={s.carrier} />}
            {s.trackingNumber && <Row label="송장번호" value={s.trackingNumber} mono />}
          </View>
        )}

        {(recipient || phone || address) && (
          <View className="mb-4">
            <Text className="text-xs text-gray-500 mb-2">받는 사람</Text>
            {recipient && <Text className="text-sm">{recipient}</Text>}
            {phone && <Text className="text-sm text-gray-600 mt-0.5">{phone}</Text>}
            {address && (
              <Text className="text-sm text-gray-600 mt-0.5">{address}</Text>
            )}
          </View>
        )}

        <View className="mb-4">
          {s.shippedAt && <Row label="발송 일시" value={formatDate(s.shippedAt)} />}
          {s.deliveredAt && (
            <Row label="배송 완료" value={formatDate(s.deliveredAt)} />
          )}
          <Row label="등록 일시" value={formatDate(s.createdAt)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-sm text-gray-600">{label}</Text>
      <Text
        className={`text-sm ${mono ? "font-mono text-xs" : ""}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
