import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import GhostAdminAPI from '@tryghost/admin-api';

const api = new GhostAdminAPI({
	url: 'https://makeuoa.nz',
	key: env.GHOST_API_KEY,
	version: 'v5.0'
});

export const GET: RequestHandler = async ({ url }) => {
	console.log('Fetching member count');
	const members = await api.members.browse({ limit: 5 });
	const memberCount = members.meta.pagination.total;
	return json({
		count: memberCount,
		members: members.map((m: any) => {
			return m.name.split(' ')[0];
		})
	});
};
