import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs as envVars, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dtos';
import type { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {

    private readonly stripe = new Stripe(envVars.stripeSecret);
    private readonly envs = envVars;
    private readonly logger = new Logger('PaymentServices');

    constructor(
        @Inject(NATS_SERVICE) private readonly client: ClientProxy,
    ){}

    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {

        const { currency, items, orderId } = paymentSessionDto;

        const line_items = items.map((item) => ({
            price_data: {
                currency: currency,
                product_data: {
                    name: item.name
                },
                unit_amount: Math.round(item.price * 100) // to 20USD,
            },
            quantity: item.quantity
        }))

        const session = await this.stripe.checkout.sessions.create({
            // TODO: ID order here!
            payment_intent_data: {
                metadata: {
                    orderId: orderId,
                },
            },

            line_items: line_items,
            mode: 'payment',
            success_url: this.envs.stripeSuccessUrl,
            cancel_url: this.envs.stripeCancelUrl,
        });

        // return session;
        return {
            cancelUrl: session.cancel_url,
            successUrl: session.success_url,
            url: session.url,
        }
    }

    async stripeWebhook(req: Request, res: Response) {
        const sig = req.headers['stripe-signature'] as string;

        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(
                req['rawBody'],
                sig,
                this.envs.stripeEndpointSecret,
            );
        } catch (err: any) {
            console.log(`⚠️  Webhook signature verification failed.`, err.message);
            return res.sendStatus(400);
        }

        switch (event.type) {
            case "charge.succeeded":
                const chargeSucceded = event.data.object;
                const payload = {
                    stripePaymentId: chargeSucceded.id,
                    orderId: chargeSucceded.metadata.orderId,
                    receiptUrl: chargeSucceded.receipt_url
                }
                // this.logger.log({payload});
                this.client.emit('payment.succeeded', payload);
                break;
        
            default:
                console.log(`The event ${event.type} not handler`);
                break;
        }

        return res.status(200).json({ sig });
    }
}
