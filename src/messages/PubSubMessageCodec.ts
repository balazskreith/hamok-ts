import { AddSubscriptionNotification, AddSubscriptionRequest, AddSubscriptionResponse } from './messagetypes/AddSubscription';
import { GetSubscriptionsRequest, GetSubscriptionsResponse } from './messagetypes/GetSubscription';
import { PublishCustomDataNotification, PublishCustomDataRequest, PublishCustomDataResponse } from './messagetypes/PublishCustomData';
import { RemoveSubscriptionNotification, RemoveSubscriptionRequest, RemoveSubscriptionResponse } from './messagetypes/RemoveSubscription';
import { HamokMessage, HamokMessage_MessageType as HamokMessageType } from './HamokMessage';
import EventEmitter from 'events';

type Input = 
    AddSubscriptionRequest |
    AddSubscriptionResponse |
    AddSubscriptionNotification |
    RemoveSubscriptionRequest |
    RemoveSubscriptionResponse | 
    RemoveSubscriptionNotification |
    PublishCustomDataRequest |
    PublishCustomDataResponse | 
    PublishCustomDataNotification |
    GetSubscriptionsRequest |
    GetSubscriptionsResponse
    ;

type EventMap = {
	message: [message: HamokMessage]
	AddSubscriptionRequest: [request: AddSubscriptionRequest],
	AddSubscriptionResponse: [response: AddSubscriptionResponse],
	AddSubscriptionNotification: [notification: AddSubscriptionNotification],
	RemoveSubscriptionRequest: [request: RemoveSubscriptionRequest],
	RemoveSubscriptionResponse: [response: RemoveSubscriptionResponse],
	RemoveSubscriptionNotification: [notification: RemoveSubscriptionNotification],
	PublishCustomDataRequest: [request: PublishCustomDataRequest],
	PublishCustomDataResponse: [response: PublishCustomDataResponse],
	PublishCustomDataNotification: [notification: PublishCustomDataNotification],
	GetSubscriptionsRequest: [request: GetSubscriptionsRequest],
	GetSubscriptionsResponse: [response: GetSubscriptionsResponse],
}

export class PubSubCodec extends EventEmitter<EventMap> {
    
	public encode(input: Input): HamokMessage {
		switch (input.constructor) {
			case AddSubscriptionRequest:
				return this.encodeAddSubscriptionRequest(input as AddSubscriptionRequest);
			case AddSubscriptionResponse:
				return this.encodeAddSubscriptionResponse(input as AddSubscriptionResponse);
			case AddSubscriptionNotification:
				return this.encodeAddSubscriptionNotification(input as AddSubscriptionNotification);
            
			case RemoveSubscriptionRequest:
				return this.encodeRemoveSubscriptionRequest(input as RemoveSubscriptionRequest);
			case RemoveSubscriptionResponse:
				return this.encodeRemoveSubscriptionResponse(input as RemoveSubscriptionResponse);
			case RemoveSubscriptionNotification:
				return this.encodeRemoveSubscriptionNotification(input as RemoveSubscriptionNotification);

			case PublishCustomDataRequest:
				return this.encodePublishCustomDataRequest(input as PublishCustomDataRequest);
			case PublishCustomDataResponse:
				return this.encodePublishCustomDataResponse(input as PublishCustomDataResponse);
			case PublishCustomDataNotification:
				return this.encodePublishCustomDataNotification(input as PublishCustomDataNotification);
            
			case GetSubscriptionsRequest:
				return this.encodeGetSubscriptionsRequest(input as GetSubscriptionsRequest);
			case GetSubscriptionsResponse:
				return this.encodeGetSubscriptionsResponse(input as GetSubscriptionsResponse);
			default:
				throw new Error(`Cannot encode input${ input}`);
		}
	}

	public decode(message: HamokMessage): Input {
		switch (message.type) {
			case HamokMessageType.ADD_SUBSCRIPTION_REQUEST:
				return this.decodeAddSubscriptionRequest(message);
			case HamokMessageType.ADD_SUBSCRIPTION_RESPONSE:
				return this.decodeAddSubscriptionResponse(message);
			case HamokMessageType.ADD_SUBSCRIPTION_NOTIFICATION:
				return this.decodeAddSubscriptionNotification(message);

			case HamokMessageType.REMOVE_ENTRIES_REQUEST:
				return this.decodeRemoveSubscriptionRequest(message);
			case HamokMessageType.REMOVE_ENTRIES_RESPONSE:
				return this.decodeRemoveSubscriptionResponse(message);
			case HamokMessageType.REMOVE_ENTRIES_NOTIFICATION:
				return this.decodeRemoveSubscriptionNotification(message);

			case HamokMessageType.PUBLISH_CUSTOM_DATA_REQUEST:
				return this.decodePublishCustomDataRequest(message);
			case HamokMessageType.PUBLISH_CUSTOM_DATA_RESPONSE:
				return this.decodePublishCustomDataResponse(message);
			case HamokMessageType.PUBLISH_CUSTOM_DATA_NOTIFICATION:
				return this.decodePublishCustomDataNotification(message);

			case HamokMessageType.GET_SUBSCRIPTIONS_REQUEST:
				return this.decodeGetSubscriptionsRequest(message);
			case HamokMessageType.GET_SUBSCRIPTIONS_RESPONSE:
				return this.decodeGetSubscriptionsResponse(message);
			default:
				throw new Error(`Cannot decode message${ message}`);
		}
	}

	public encodeAddSubscriptionRequest(request: AddSubscriptionRequest): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.ADD_SUBSCRIPTION_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
			raftLeaderId: request.event,
		});
	}

	public decodeAddSubscriptionRequest(message: HamokMessage): AddSubscriptionRequest {
		if (message.type !== HamokMessageType.ADD_SUBSCRIPTION_REQUEST) {
			throw new Error('decodeAddSubscriptionRequest(): HamokMessage type must be ADD_SUBSCRIPTION_REQUEST');
		}
		
		return new AddSubscriptionRequest(
			message.requestId!,
			message.raftLeaderId!,
			message.sourceId!,
		);
	}

	public encodeAddSubscriptionResponse(response: AddSubscriptionResponse): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.ADD_SUBSCRIPTION_RESPONSE,
			requestId: response.requestId,
			success: response.success,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeAddSubscriptionResponse(message: HamokMessage): AddSubscriptionResponse {
		if (message.type !== HamokMessageType.ADD_SUBSCRIPTION_RESPONSE) {
			throw new Error('decodeAddSubscriptionResponse(): HamokMessage type must be ADD_SUBSCRIPTION_RESPONSE');
		}
		
		return new AddSubscriptionResponse(
			message.requestId!,
			Boolean(message.success),
			message.destinationId,
		);
	}

	public encodeAddSubscriptionNotification(notification: AddSubscriptionNotification): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.ADD_SUBSCRIPTION_NOTIFICATION,
			raftLeaderId: notification.event,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeAddSubscriptionNotification(message: HamokMessage): AddSubscriptionNotification {
		if (message.type !== HamokMessageType.ADD_SUBSCRIPTION_NOTIFICATION) {
			throw new Error('decodeAddSubscriptionNotification(): HamokMessage type must be ADD_SUBSCRIPTION_NOTIFICATION');
		}
		
		return new AddSubscriptionNotification(
			message.raftLeaderId!,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeRemoveSubscriptionRequest(request: RemoveSubscriptionRequest): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.REMOVE_SUBSCRIPTION_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
			raftLeaderId: request.event,
		});
	}

	public decodeRemoveSubscriptionRequest(message: HamokMessage): RemoveSubscriptionRequest {
		if (message.type !== HamokMessageType.REMOVE_SUBSCRIPTION_REQUEST) {
			throw new Error('decodeRemoveSubscriptionRequest(): HamokMessage type must be REMOVE_SUBSCRIPTION_REQUEST');
		}
		
		return new RemoveSubscriptionRequest(
			message.requestId!,
			message.raftLeaderId!,
			message.sourceId!,
		);
	}

	public encodeRemoveSubscriptionResponse(response: RemoveSubscriptionResponse): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.REMOVE_SUBSCRIPTION_RESPONSE,
			requestId: response.requestId,
			success: response.success,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeRemoveSubscriptionResponse(message: HamokMessage): RemoveSubscriptionResponse {
		if (message.type !== HamokMessageType.REMOVE_SUBSCRIPTION_RESPONSE) {
			throw new Error('decodeRemoveSubscriptionResponse(): HamokMessage type must be REMOVE_SUBSCRIPTION_RESPONSE');
		}
		
		return new RemoveSubscriptionResponse(
			message.requestId!,
			Boolean(message.success),
			message.destinationId,
		);
	}

	public encodeRemoveSubscriptionNotification(notification: RemoveSubscriptionNotification): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.REMOVE_SUBSCRIPTION_NOTIFICATION,
			raftLeaderId: notification.event,
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodeRemoveSubscriptionNotification(message: HamokMessage): RemoveSubscriptionNotification {
		if (message.type !== HamokMessageType.REMOVE_SUBSCRIPTION_NOTIFICATION) {
			throw new Error('decodeRemoveSubscriptionNotification(): HamokMessage type must be REMOVE_SUBSCRIPTION_NOTIFICATION');
		}
		
		return new RemoveSubscriptionNotification(
			message.raftLeaderId!,
			message.sourceId,
			message.destinationId,
		);
	}

	public encodePublishCustomDataRequest(request: PublishCustomDataRequest): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.PUBLISH_CUSTOM_DATA_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
			raftLeaderId: request.event,
			values: [ request.customData ],
		});
	}

	public decodePublishCustomDataRequest(message: HamokMessage): PublishCustomDataRequest {
		if (message.type !== HamokMessageType.PUBLISH_CUSTOM_DATA_REQUEST) {
			throw new Error('decodePublishCustomDataRequest(): HamokMessage type must be PUBLISH_DATA_REQUEST');
		}
		
		return new PublishCustomDataRequest(
			message.requestId!,
			message.raftLeaderId!,
			message.values[0],
			message.sourceId!,
		);
	}

	public encodePublishCustomDataResponse(response: PublishCustomDataResponse): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.PUBLISH_CUSTOM_DATA_RESPONSE,
			requestId: response.requestId,
			success: response.success,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodePublishCustomDataResponse(message: HamokMessage): PublishCustomDataResponse {
		if (message.type !== HamokMessageType.PUBLISH_CUSTOM_DATA_RESPONSE) {
			throw new Error('decodePublishCustomDataResponse(): HamokMessage type must be PUBLISH_DATA_RESPONSE');
		}
		
		return new PublishCustomDataResponse(
			message.requestId!,
			Boolean(message.success),
			message.destinationId,
		);
	}

	public encodePublishCustomDataNotification(notification: PublishCustomDataNotification): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.PUBLISH_CUSTOM_DATA_NOTIFICATION,
			raftLeaderId: notification.event,
			values: [ notification.customData ],
			sourceId: notification.sourceEndpointId,
			destinationId: notification.destinationEndpointId,
		});
	}

	public decodePublishCustomDataNotification(message: HamokMessage): PublishCustomDataNotification {
		if (message.type !== HamokMessageType.PUBLISH_CUSTOM_DATA_NOTIFICATION) {
			throw new Error('decodePublishCustomDataNotification(): HamokMessage type must be PUBLISH_DATA_NOTIFICATION');
		}
		
		return new PublishCustomDataNotification(
			message.raftLeaderId!,
			message.values[0],
			message.sourceId,
			message.destinationId,
		);
	}

	public encodeGetSubscriptionsRequest(request: GetSubscriptionsRequest): HamokMessage {
		return new HamokMessage({
			type: HamokMessageType.GET_SUBSCRIPTIONS_REQUEST,
			requestId: request.requestId,
			sourceId: request.sourceEndpointId,
		});
	}

	public decodeGetSubscriptionsRequest(message: HamokMessage): GetSubscriptionsRequest {
		if (message.type !== HamokMessageType.GET_SUBSCRIPTIONS_REQUEST) {
			throw new Error('decodePublishCustomDataRequest(): HamokMessage type must be PUBLISH_DATA_REQUEST');
		}
		
		return new GetSubscriptionsRequest(
			message.requestId!,
			message.sourceId,
		);
	}

	public encodeGetSubscriptionsResponse(response: GetSubscriptionsResponse): HamokMessage {
		const keys: Uint8Array[] = [];
		const values: Uint8Array[] = [];

		for (const [ topic, remoteEndpointIds ] of response.subscriptions) {
			const encodedKey: Uint8Array = Buffer.from(topic, 'utf-8');
			const json = JSON.stringify(Array.from(remoteEndpointIds));
			const encodedValue: Uint8Array = Buffer.from(json, 'utf-8');

			keys.push(encodedKey);
			values.push(encodedValue);
		}
		
		return new HamokMessage({
			type: HamokMessageType.GET_SUBSCRIPTIONS_RESPONSE,
			requestId: response.requestId,
			keys,
			values,
			destinationId: response.destinationEndpointId,
		});
	}

	public decodeGetSubscriptionsResponse(message: HamokMessage): GetSubscriptionsResponse {
		if (message.type !== HamokMessageType.GET_SUBSCRIPTIONS_RESPONSE) {
			throw new Error('decodePublishCustomDataResponse(): HamokMessage type must be GET_SUBSCRIPTIONS_RESPONSE');
		}
		const subscriptions = new Map<string, Set<string>>();
		const { keys, values } = message;
		const length = Math.min(keys.length, values.length);

		for (let index = 0; index < length; ++index) {
			const key = keys[index];
			const value = values[index];
			const topic = Buffer.from(key).toString('utf-8');
			const json = Buffer.from(value).toString('utf-8');
			const remoteEndpointIds = JSON.parse(json);

			subscriptions.set(topic, new Set<string>(remoteEndpointIds));
		}

		return new GetSubscriptionsResponse(
			message.requestId!,
			subscriptions,
			message.destinationId,
		);
	}
}